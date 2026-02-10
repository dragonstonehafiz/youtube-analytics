from __future__ import annotations

import sqlite3

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from config import settings
from src.database.db import get_connection, row_to_dict
from src.sync import prune_missing_videos_task, sync_all, sync_videos
from src.youtube.videos import get_channel_info

router = APIRouter()


def _get_table_storage(conn: sqlite3.Connection, db_size_bytes: int) -> list[dict]:
    """Return per-table storage usage in bytes with percent normalized to tracked tables only."""
    table_rows = conn.execute(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    table_names = [row["name"] for row in table_rows]
    if not table_names:
        return []
    try:
        object_rows = conn.execute("SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name").fetchall()
    except sqlite3.OperationalError:
        return []

    object_bytes = {row["name"]: int(row["bytes"] or 0) for row in object_rows}
    index_rows = conn.execute(
        "SELECT name, tbl_name FROM sqlite_schema WHERE type = 'index' AND tbl_name NOT LIKE 'sqlite_%'"
    ).fetchall()
    index_to_table = {row["name"]: row["tbl_name"] for row in index_rows if row["name"] and row["tbl_name"]}

    totals = {name: object_bytes.get(name, 0) for name in table_names}
    for index_name, table_name in index_to_table.items():
        if table_name in totals:
            totals[table_name] += object_bytes.get(index_name, 0)

    sorted_totals = sorted(totals.items(), key=lambda item: item[1], reverse=True)
    tracked_total_bytes = sum(table_bytes for _, table_bytes in sorted_totals)
    output = []
    for table_name, table_bytes in sorted_totals:
        percent = round((table_bytes / tracked_total_bytes) * 100, 2) if tracked_total_bytes > 0 else 0.0
        output.append({"table": table_name, "bytes": table_bytes, "percent": percent})
    return output


@router.get("/health")
def health() -> dict:
    """Return basic health status and startup configuration."""
    return {"ok": True}


@router.post("/sync")
def sync(
    background_tasks: BackgroundTasks,
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
    start_data: str | None = None,
    pull: str | None = None,
) -> dict:
    """Trigger a sync with optional date range and deep sync flag."""
    # Allow start_data as an alias for start_date (typo-friendly).
    if start_date is None and start_data is not None:
        start_date = start_data
    pulls: list[str] | None = None
    if pull:
        pulls = [item.strip() for item in pull.split(",") if item.strip()]
    background_tasks.add_task(
        sync_all,
        start_date=start_date,
        end_date=end_date,
        deep_sync=deep_sync,
        pulls=pulls,
    )
    return {"queued": True}


@router.post("/sync/prune")
def prune(background_tasks: BackgroundTasks) -> dict:
    """Remove videos that no longer exist and their related analytics."""
    background_tasks.add_task(prune_missing_videos_task)
    return {"queued": True}


@router.get("/me")
def me() -> dict:
    """Return authenticated channel metadata."""
    channel = get_channel_info()
    snippet = channel.get("snippet", {})
    stats = channel.get("statistics", {})
    return {
        "id": channel.get("id"),
        "title": snippet.get("title"),
        "description": snippet.get("description"),
        "published_at": snippet.get("publishedAt"),
        "country": snippet.get("country"),
        "view_count": stats.get("viewCount"),
        "subscriber_count": stats.get("subscriberCount"),
        "video_count": stats.get("videoCount"),
    }


@router.get("/videos")
def list_videos(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    q: str | None = None,
    published_after: str | None = None,
    published_before: str | None = None,
    privacy_status: str | None = None,
    content_type: str | None = None,
    sort: str | None = None,
    direction: str | None = None,
) -> dict:
    """Return videos with optional filters and pagination."""
    where_clauses = []
    params: list[object] = []

    if q:
        where_clauses.append("title LIKE ?")
        params.append(f"%{q}%")
    if published_after:
        where_clauses.append("published_at >= ?")
        params.append(published_after)
    if published_before:
        where_clauses.append("published_at <= ?")
        params.append(published_before)
    if privacy_status:
        where_clauses.append("privacy_status = ?")
        params.append(privacy_status)
    if content_type:
        where_clauses.append("content_type = ?")
        params.append(content_type)

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    sort_map = {
        "date": "published_at",
        "views": "view_count",
        "comments": "comment_count",
        "likes": "like_count",
    }
    sort_column = sort_map.get(sort or "", "published_at")
    sort_dir = "ASC" if (direction or "").lower() == "asc" else "DESC"

    with get_connection() as conn:
        query = f"""
            SELECT * FROM videos
            {where_sql}
            ORDER BY {sort_column} {sort_dir}
            LIMIT ? OFFSET ?
        """
        rows = conn.execute(query, tuple(params + [limit, offset])).fetchall()
        count_query = f"SELECT COUNT(*) AS total FROM videos {where_sql}"
        total_row = conn.execute(count_query, tuple(params)).fetchone()
        total = total_row["total"] if total_row and total_row["total"] is not None else 0
    return {"items": [row_to_dict(row) for row in rows], "total": total}


@router.get("/comments")
def list_comments(
    video_id: str | None = None,
    published_after: str | None = None,
    published_before: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    sort_by: str = Query(default="published_at"),
    direction: str = Query(default="desc"),
) -> dict:
    """Return comments with optional video filter/pagination and parent rows for thread rendering."""
    where_clauses = []
    params: list[object] = []
    if video_id:
        where_clauses.append("c.video_id = ?")
        params.append(video_id)
    if published_after:
        where_clauses.append("date(c.published_at) >= ?")
        params.append(published_after)
    if published_before:
        where_clauses.append("date(c.published_at) <= ?")
        params.append(published_before)
    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    sort_map = {
        "published_at": "c.published_at",
        "likes": "COALESCE(c.like_count, 0)",
        "reply_count": "COALESCE(c.reply_count, 0)",
    }
    sort_column = sort_map.get(sort_by, "published_at")
    sort_dir = "ASC" if direction.lower() == "asc" else "DESC"
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT c.*, v.title AS video_title, v.thumbnail_url AS video_thumbnail_url
            FROM comments c
            LEFT JOIN videos v ON v.id = c.video_id
            {where_sql}
            ORDER BY {sort_column} {sort_dir}, c.id DESC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [limit, offset]),
        ).fetchall()
        total_row = conn.execute(
            f"SELECT COUNT(*) AS total FROM comments c {where_sql}",
            tuple(params),
        ).fetchone()
    items = [row_to_dict(row) for row in rows]
    parent_ids: set[str] = set()
    item_ids = {str(item.get("id")) for item in items if item.get("id")}
    for item in items:
        parent_id = item.get("parent_id")
        if parent_id and str(parent_id) not in item_ids:
            parent_ids.add(str(parent_id))

    parents: list[dict] = []
    if parent_ids:
        placeholders = ", ".join(["?"] * len(parent_ids))
        with get_connection() as conn:
            parent_rows = conn.execute(
                f"""
                SELECT c.*, v.title AS video_title, v.thumbnail_url AS video_thumbnail_url
                FROM comments c
                LEFT JOIN videos v ON v.id = c.video_id
                WHERE c.id IN ({placeholders})
                ORDER BY {sort_column} {sort_dir}, c.id DESC
                """,
                tuple(parent_ids),
            ).fetchall()
        parents = [row_to_dict(row) for row in parent_rows]

    total = total_row["total"] if total_row and total_row["total"] is not None else 0
    return {"items": items, "parents": parents, "total": total}


@router.get("/comments/{comment_id}/replies")
def list_comment_replies(
    comment_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    sort_by: str = Query(default="published_at"),
    direction: str = Query(default="desc"),
) -> dict:
    """Return replies for one parent comment from local DB with pagination and sorting."""
    with get_connection() as conn:
        parent_row = conn.execute("SELECT id, reply_count FROM comments WHERE id = ?", (comment_id,)).fetchone()
        if parent_row is None:
            raise HTTPException(status_code=404, detail="Parent comment not found.")
        sort_map = {
            "published_at": "c.published_at",
            "likes": "COALESCE(c.like_count, 0)",
            "reply_count": "COALESCE(c.reply_count, 0)",
        }
        sort_column = sort_map.get(sort_by, "c.published_at")
        sort_dir = "ASC" if direction.lower() == "asc" else "DESC"
        rows = conn.execute(
            f"""
            SELECT c.*, v.title AS video_title, v.thumbnail_url AS video_thumbnail_url
            FROM comments c
            LEFT JOIN videos v ON v.id = c.video_id
            WHERE c.parent_id = ?
            ORDER BY {sort_column} {sort_dir}, c.id DESC
            LIMIT ? OFFSET ?
            """,
            (comment_id, limit, offset),
        ).fetchall()
    items = [row_to_dict(row) for row in rows]
    total = int(parent_row["reply_count"] or 0)
    return {"items": items, "total": total}


@router.get("/comments/{comment_id}")
def get_comment(comment_id: str) -> dict:
    """Return a single comment row by ID."""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT c.*, v.title AS video_title, v.thumbnail_url AS video_thumbnail_url
            FROM comments c
            LEFT JOIN videos v ON v.id = c.video_id
            WHERE c.id = ?
            """,
            (comment_id,),
        ).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Comment not found.")
    return {"item": row_to_dict(row)}


@router.get("/analytics/daily")
def list_daily_analytics(
    start_date: str | None = None,
    end_date: str | None = None,
    video_id: str | None = None,
    limit: int = Query(default=1000, ge=1, le=10000),
) -> dict:
    """Return daily analytics with optional filters."""
    where_clauses = []
    params: list[object] = []

    if start_date:
        where_clauses.append("date >= ?")
        params.append(start_date)
    if end_date:
        where_clauses.append("date <= ?")
        params.append(end_date)
    if video_id:
        where_clauses.append("video_id = ?")
        params.append(video_id)

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    query = f"""
        SELECT * FROM daily_analytics
        {where_sql}
        ORDER BY date DESC
        LIMIT ?
    """
    params.append(limit)

    with get_connection() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    return {"items": [row_to_dict(row) for row in rows]}


@router.get("/analytics/years")
def list_analytics_years() -> dict:
    """Return distinct years present in daily analytics data."""
    with get_connection() as conn:
        daily_row = conn.execute(
            "SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM daily_analytics"
        ).fetchone()
        channel_row = conn.execute(
            "SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM channel_daily_analytics"
        ).fetchone()
    min_dates = [row["min_date"] for row in (daily_row, channel_row) if row and row["min_date"]]
    max_dates = [row["max_date"] for row in (daily_row, channel_row) if row and row["max_date"]]
    if not min_dates or not max_dates:
        return {"years": []}
    min_year = int(str(min(min_dates))[:4])
    max_year = int(str(max(max_dates))[:4])
    years = [str(year) for year in range(max_year, min_year - 1, -1)]
    return {"years": years}


@router.get("/analytics/daily/summary")
def list_daily_summary(start_date: str, end_date: str, content_type: str | None = None) -> dict:
    """Return per-day totals and range KPIs, optionally filtered by video content type."""
    where_sql = "a.date >= ? AND a.date <= ?"
    params: list[object] = [start_date, end_date]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                a.date AS day,
                SUM(a.views) AS views,
                SUM(a.watch_time_minutes) AS watch_time_minutes,
                SUM(a.estimated_revenue) AS estimated_revenue,
                SUM(a.average_view_duration_seconds) AS average_view_duration_seconds,
                SUM(a.likes) AS likes,
                SUM(a.comments) AS comments,
                SUM(a.shares) AS shares,
                SUM(a.subscribers_gained) AS subscribers_gained,
                SUM(a.subscribers_lost) AS subscribers_lost
            FROM daily_analytics a
            JOIN videos v ON v.id = a.video_id
            WHERE {where_sql}
            GROUP BY a.date
            ORDER BY a.date ASC
            """,
            tuple(params),
        ).fetchall()

    items = [row_to_dict(row) for row in rows]
    totals = {
        "views": sum(item.get("views") or 0 for item in items),
        "watch_time_minutes": sum(item.get("watch_time_minutes") or 0 for item in items),
        "estimated_revenue": sum(item.get("estimated_revenue") or 0 for item in items),
        "subscribers_gained": sum(item.get("subscribers_gained") or 0 for item in items),
        "subscribers_lost": sum(item.get("subscribers_lost") or 0 for item in items),
    }
    totals["subscribers_net"] = totals["subscribers_gained"] - totals["subscribers_lost"]
    return {"items": items, "totals": totals}


@router.get("/analytics/channel-daily")
def list_channel_daily(
    start_date: str,
    end_date: str,
) -> dict:
    """Return channel-level daily analytics rows for a range."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                date AS day,
                views,
                watch_time_minutes,
                estimated_revenue,
                average_view_duration_seconds,
                subscribers_gained,
                subscribers_lost
            FROM channel_daily_analytics
            WHERE date >= ? AND date <= ?
            ORDER BY date ASC
            """,
            (start_date, end_date),
        ).fetchall()

    items = [row_to_dict(row) for row in rows]
    totals = {
        "views": sum(item.get("views") or 0 for item in items),
        "watch_time_minutes": sum(item.get("watch_time_minutes") or 0 for item in items),
        "estimated_revenue": sum(item.get("estimated_revenue") or 0 for item in items),
        "average_view_duration_seconds": sum(item.get("average_view_duration_seconds") or 0 for item in items),
        "subscribers_gained": sum(item.get("subscribers_gained") or 0 for item in items),
        "subscribers_lost": sum(item.get("subscribers_lost") or 0 for item in items),
    }
    return {"items": items, "totals": totals}


@router.get("/videos/published")
def list_published_dates(start_date: str, end_date: str, content_type: str | None = None) -> dict:
    """Return published video titles by date within a range, optionally filtered by content type."""
    where_sql = """
            WHERE published_at IS NOT NULL
              AND date(published_at) >= ?
              AND date(published_at) <= ?
    """
    params: list[object] = [start_date, end_date]
    if content_type:
        where_sql += " AND content_type = ?"
        params.append(content_type)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT date(published_at) AS day, title, published_at, thumbnail_url, content_type
            FROM videos
            {where_sql}
            ORDER BY day ASC, published_at ASC
            """,
            tuple(params),
        ).fetchall()
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        day = row["day"]
        title = row["title"] or "(untitled)"
        published_at = row["published_at"] or ""
        thumbnail_url = row["thumbnail_url"] or ""
        content_type = row["content_type"] or ""
        grouped.setdefault(day, []).append(
            {"title": title, "published_at": published_at, "thumbnail_url": thumbnail_url, "content_type": content_type}
        )
    items = [{"day": day, "items": items, "count": len(items)} for day, items in grouped.items()]
    return {"items": items}


@router.get("/videos/{video_id}")
def get_video(video_id: str) -> dict:
    """Return one video row by ID."""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM videos WHERE id = ?", (video_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Video not found.")
    return {"item": row_to_dict(row)}


@router.get("/analytics/top-content")
def list_top_content(start_date: str, end_date: str, limit: int = 10, content_type: str | None = None) -> dict:
    """Return top content in a date range, sorted by views, optionally filtered by content type."""
    where_sql = "a.date >= ? AND a.date <= ?"
    params: list[object] = [start_date, end_date]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)
    params.append(limit)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                v.id AS video_id,
                v.title AS title,
                v.published_at AS published_at,
                v.thumbnail_url AS thumbnail_url,
                v.duration_seconds AS duration_seconds,
                SUM(a.views) AS views,
                AVG(a.average_view_duration_seconds) AS avg_view_duration_seconds
            FROM daily_analytics a
            JOIN videos v ON v.id = a.video_id
            WHERE {where_sql}
            GROUP BY v.id
            ORDER BY views DESC
            LIMIT ?
            """,
            tuple(params),
        ).fetchall()
    items = []
    for row in rows:
        duration_seconds = row["duration_seconds"] or 0
        avg_view_duration_seconds = row["avg_view_duration_seconds"] or 0
        avg_view_pct = 0.0
        if duration_seconds:
            avg_view_pct = (avg_view_duration_seconds / duration_seconds) * 100
        items.append(
            {
                "video_id": row["video_id"],
                "title": row["title"] or "(untitled)",
                "published_at": row["published_at"] or "",
                "thumbnail_url": row["thumbnail_url"] or "",
                "views": row["views"] or 0,
                "avg_view_duration_seconds": avg_view_duration_seconds,
                "avg_view_pct": avg_view_pct,
            }
        )
    return {"items": items}


@router.get("/sync/status")
def get_sync_status() -> dict:
    """Return the latest sync run status."""
    with get_connection() as conn:
        row = conn.execute(
            (
                "SELECT id, started_at, finished_at, status, error_message, "
                "start_date, end_date, deep_sync, pulls "
                "FROM sync_runs ORDER BY id DESC LIMIT 1"
            )
        ).fetchone()
    return {"run": row_to_dict(row) if row else None}


@router.get("/sync/runs")
def list_sync_runs(limit: int = 10, offset: int = 0) -> dict:
    """Return recent sync runs with pagination."""
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    with get_connection() as conn:
        total = conn.execute("SELECT COUNT(*) AS count FROM sync_runs").fetchone()[0]
        rows = conn.execute(
            (
                "SELECT id, started_at, finished_at, status, error_message, "
                "start_date, end_date, deep_sync, pulls "
                "FROM sync_runs ORDER BY id DESC LIMIT ? OFFSET ?"
            ),
            (safe_limit, safe_offset),
        ).fetchall()
    return {"items": [row_to_dict(row) for row in rows], "total": total}


@router.get("/sync/progress")
def get_sync_progress_state() -> dict:
    """Return in-memory sync progress state."""
    from src.sync import get_sync_progress

    return get_sync_progress()


@router.get("/stats/overview")
def get_overview_stats() -> dict:
    """Return basic database and channel totals."""
    with get_connection() as conn:
        page_count = conn.execute("PRAGMA page_count").fetchone()[0]
        page_size = conn.execute("PRAGMA page_size").fetchone()[0]
        db_size_bytes = page_count * page_size
        total_uploads = conn.execute("SELECT COUNT(*) AS count FROM videos").fetchone()[0]
        total_views_row = conn.execute("SELECT SUM(views) AS total FROM channel_daily_analytics").fetchone()
        total_views = total_views_row["total"] if total_views_row and total_views_row["total"] is not None else 0
        total_comments_row = conn.execute("SELECT COUNT(*) AS count FROM comments").fetchone()
        total_comments = total_comments_row["count"] if total_comments_row and total_comments_row["count"] is not None else 0
        earliest_row = conn.execute("SELECT MIN(date) AS earliest FROM daily_analytics").fetchone()
        latest_row = conn.execute("SELECT MAX(date) AS latest FROM daily_analytics").fetchone()
        earliest_date = earliest_row["earliest"] if earliest_row else None
        latest_date = latest_row["latest"] if latest_row else None
        daily_rows = conn.execute("SELECT COUNT(*) AS count FROM daily_analytics").fetchone()
        channel_rows = conn.execute("SELECT COUNT(*) AS count FROM channel_daily_analytics").fetchone()
        traffic_rows = conn.execute("SELECT COUNT(*) AS count FROM traffic_sources_daily").fetchone()
        daily_analytics_rows = daily_rows["count"] if daily_rows and daily_rows["count"] is not None else 0
        channel_daily_rows = channel_rows["count"] if channel_rows and channel_rows["count"] is not None else 0
        traffic_sources_rows = traffic_rows["count"] if traffic_rows and traffic_rows["count"] is not None else 0
        table_storage = _get_table_storage(conn, db_size_bytes)
    return {
        "db_size_bytes": db_size_bytes,
        "total_uploads": total_uploads,
        "total_views": total_views,
        "total_comments": total_comments,
        "earliest_date": earliest_date,
        "latest_date": latest_date,
        "daily_analytics_rows": daily_analytics_rows,
        "channel_daily_rows": channel_daily_rows,
        "traffic_sources_rows": traffic_sources_rows,
        "table_storage": table_storage,
    }
