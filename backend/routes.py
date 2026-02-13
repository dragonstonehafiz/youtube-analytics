from __future__ import annotations

import sqlite3
from math import ceil
from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, BackgroundTasks, HTTPException, Query

from config import settings
from src.database.db import get_connection, row_to_dict
from src.sync import prune_missing_videos_task, request_sync_stop, sync_all, sync_videos
from src.youtube.analytics import DateRange, chunk_date_range
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


def _get_table_row_counts(conn: sqlite3.Connection) -> list[dict]:
    """Return row counts for all project tables except sync_runs."""
    table_rows = conn.execute(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'sync_runs'"
    ).fetchall()
    table_names = sorted([str(row["name"]) for row in table_rows if row["name"]])
    output: list[dict] = []
    for table_name in table_names:
        try:
            row = conn.execute(f'SELECT COUNT(*) AS count FROM "{table_name}"').fetchone()
            count = int(row["count"] or 0) if row else 0
        except sqlite3.OperationalError:
            count = 0
        output.append({"table": table_name, "rows": count})
    return output


def _to_date(value: str | None) -> datetime.date | None:
    """Parse YYYY-MM-DD into date object, returning None for invalid values."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except ValueError:
        return None


def _get_video_rows(conn: sqlite3.Connection) -> list[dict]:
    """Return video ids with normalized publish dates."""
    rows = conn.execute("SELECT id, date(published_at) AS published_date FROM videos").fetchall()
    return [{"id": str(row["id"]), "published_date": str(row["published_date"]) if row["published_date"] else None} for row in rows]


def _get_playlist_rows(conn: sqlite3.Connection) -> list[dict]:
    """Return playlist ids with normalized publish dates."""
    rows = conn.execute("SELECT id, date(published_at) AS published_date FROM playlists").fetchall()
    return [{"id": str(row["id"]), "published_date": str(row["published_date"]) if row["published_date"] else None} for row in rows]


def _filter_rows_by_period(rows: list[dict], start_date: str | None, end_date: str | None) -> list[dict]:
    """Filter entity rows by selected period using published_date when available."""
    start = _to_date(start_date)
    end = _to_date(end_date)
    if not start and not end:
        return rows
    filtered: list[dict] = []
    for item in rows:
        published = _to_date(item.get("published_date"))
        if not published:
            continue
        if start and published < start:
            continue
        if end and published > end:
            continue
        filtered.append(item)
    return filtered


def _row_bounds(rows: list[dict]) -> tuple[str | None, str | None]:
    """Return min/max published_date bounds from normalized entity rows."""
    dates = [str(item["published_date"]) for item in rows if item.get("published_date")]
    if not dates:
        return None, None
    return min(dates), max(dates)


def _get_latest_by_id(conn: sqlite3.Connection, table_name: str, id_column: str) -> dict[str, str]:
    """Return max(date) map by id for a table."""
    rows = conn.execute(
        f'SELECT "{id_column}" AS item_id, MAX(date) AS latest FROM "{table_name}" GROUP BY "{id_column}"'
    ).fetchall()
    output: dict[str, str] = {}
    for row in rows:
        if row["item_id"] and row["latest"]:
            output[str(row["item_id"])] = str(row["latest"])
    return output


def _effective_range(
    conn: sqlite3.Connection,
    start_date: str | None,
    end_date: str | None,
    earliest_sql: str,
) -> tuple[str, str] | None:
    """Resolve effective sync range using selected period and DB earliest fallback."""
    earliest_row = conn.execute(earliest_sql).fetchone()
    earliest = str(earliest_row["earliest"]) if earliest_row and earliest_row["earliest"] else None
    if not earliest:
        return None
    default_start = datetime.fromisoformat(earliest).date()
    default_end = datetime.now(UTC).date() - timedelta(days=1)
    if default_end < default_start:
        default_end = default_start
    resolved_start = _to_date(start_date) or default_start
    resolved_end = _to_date(end_date) or default_end
    today = datetime.now(UTC).date()
    if resolved_end > today:
        resolved_end = today
    if resolved_start > resolved_end:
        return None
    return resolved_start.isoformat(), resolved_end.isoformat()


def _estimate_segment_calls_with_context(
    rows: list[dict],
    latest_by_id: dict[str, str],
    start: str,
    end: str,
    months_per_chunk: int,
) -> tuple[int, int, int]:
    """Estimate segment-based calls with entity and segment counts."""
    start_date = _to_date(start)
    end_date = _to_date(end)
    if not start_date or not end_date:
        return 0, 0, 0
    segments = chunk_date_range(DateRange(start=start_date.isoformat(), end=end_date.isoformat()), months_per_chunk=months_per_chunk)
    calls = 0
    active_ids: set[str] = set()
    for segment in segments:
        seg_start = _to_date(segment.start)
        seg_end = _to_date(segment.end)
        if not seg_start or not seg_end:
            continue
        for item in rows:
            published = _to_date(item.get("published_date"))
            if published and published > seg_end:
                continue
            latest = _to_date(latest_by_id.get(item["id"]))
            next_start = (latest + timedelta(days=1)) if latest else seg_start
            if next_start > seg_end:
                continue
            calls += 1
            active_ids.add(item["id"])
    return calls, len(active_ids), len(segments)


def _estimate_search_calls_with_context(
    rows: list[dict],
    latest_by_id: dict[str, str],
    start: str,
    end: str,
) -> tuple[int, int, int]:
    """Estimate video-search calls with active video count and covered days."""
    range_start = _to_date(start)
    range_end = _to_date(end)
    if not range_start or not range_end:
        return 0, 0, 0
    calls = 0
    active_videos = 0
    total_days = 0
    for item in rows:
        effective_start = range_start
        published = _to_date(item.get("published_date"))
        if published and published > range_end:
            continue
        if published and published > effective_start:
            effective_start = published
        latest = _to_date(latest_by_id.get(item["id"]))
        if latest and (latest + timedelta(days=1)) > effective_start:
            effective_start = latest + timedelta(days=1)
        if effective_start > range_end:
            continue
        active_videos += 1
        day_count = (range_end - effective_start).days + 1
        total_days += day_count
        calls += day_count
    return calls, active_videos, total_days


def _estimate_min_api_calls_for_table(
    conn: sqlite3.Connection,
    table: str,
    start_date: str | None,
    end_date: str | None,
    deep_sync: bool,
) -> dict:
    """Estimate minimum API calls for one selected table under current sync period."""
    video_rows = _get_video_rows(conn)
    playlist_rows = _get_playlist_rows(conn)
    all_video_count = len(video_rows)
    all_playlist_count = len(playlist_rows)
    videos_period_start, videos_period_end = _row_bounds(video_rows)
    playlists_period_start, playlists_period_end = _row_bounds(playlist_rows)
    range_videos = _effective_range(conn, start_date, end_date, "SELECT MIN(date(published_at)) AS earliest FROM videos")
    range_playlists = _effective_range(conn, start_date, end_date, "SELECT MIN(date(published_at)) AS earliest FROM playlists")

    if table == "videos":
        # Matches sync_videos(): period is ignored; full uploads are fetched.
        upload_playlist_calls = max(1, ceil(max(all_video_count, 1) / 50))
        video_detail_calls = max(1, ceil(max(all_video_count, 1) / 50))
        source_rows = video_rows
        source_ids = [str(row["id"]) for row in source_rows]
        if source_ids:
            placeholders = ",".join("?" for _ in source_ids)
            shorts_count_row = conn.execute(
                f"SELECT COUNT(*) AS count FROM videos WHERE content_type = 'short' AND id IN ({placeholders})",
                tuple(source_ids),
            ).fetchone()
            shorts_count = int(shorts_count_row["count"] or 0) if shorts_count_row else 0
        else:
            shorts_count = 0
        short_playlist_calls = max(1, ceil(max(shorts_count, 1) / 50))
        return {
            "minimum_api_calls": upload_playlist_calls + video_detail_calls + short_playlist_calls,
            "basis": "uploads playlistItems.list + videos.list + shorts playlistItems.list",
            "effective_start_date": videos_period_start,
            "effective_end_date": videos_period_end,
            "uses_period": False,
        }
    if table in {"playlists", "playlist_items"}:
        # Matches sync_playlists(): period is ignored; all playlists/items are fetched.
        target_playlist_ids = {row["id"] for row in playlist_rows}
        playlist_item_rows = conn.execute("SELECT id, item_count FROM playlists").fetchall()
        per_playlist_item_calls = 0
        for row in playlist_item_rows:
            playlist_id = str(row["id"] or "")
            if playlist_id not in target_playlist_ids:
                continue
            item_count = int(row["item_count"] or 0)
            per_playlist_item_calls += max(1, ceil(max(item_count, 1) / 50))
        playlist_list_calls = max(1, ceil(max(all_playlist_count, 1) / 50))
        return {
            "minimum_api_calls": playlist_list_calls + per_playlist_item_calls,
            "basis": "playlists.list + playlistItems.list per playlist (minimum paging)",
            "effective_start_date": playlists_period_start,
            "effective_end_date": playlists_period_end,
            "uses_period": False,
        }
    if table == "comments":
        # Matches sync_comments(): period is ignored; runs per current videos set.
        return {
            "minimum_api_calls": max(all_video_count, 1),
            "basis": "commentThreads.list per video (minimum one call each, no pagination)",
            "effective_start_date": videos_period_start,
            "effective_end_date": videos_period_end,
            "uses_period": False,
        }
    if table == "audience":
        # Matches sync_audience(): period is ignored.
        subscriber_row = conn.execute(
            "SELECT COUNT(*) AS count FROM audience WHERE is_public_subscriber = 1"
        ).fetchone()
        public_subscribers = int(subscriber_row["count"] or 0) if subscriber_row else 0
        return {
            "minimum_api_calls": max(1, ceil(max(public_subscribers, 1) / 50)),
            "basis": "subscriptions.list (minimum paging); commenter backfill is DB-only",
            "effective_start_date": None,
            "effective_end_date": None,
            "uses_period": False,
        }
    if table == "channel_analytics":
        if not range_videos:
            return {"minimum_api_calls": 0, "basis": "no videos/date range", "effective_start_date": None, "effective_end_date": None, "uses_period": True}
        start, end = range_videos
        if not deep_sync:
            latest_row = conn.execute("SELECT MAX(date) AS latest FROM channel_analytics").fetchone()
            latest = str(latest_row["latest"]) if latest_row and latest_row["latest"] else None
            latest_date = _to_date(latest)
            if latest_date:
                next_day = (latest_date + timedelta(days=1)).isoformat()
                if next_day > start:
                    start = next_day
        if _to_date(start) and _to_date(end) and _to_date(start) <= _to_date(end):
            segments = chunk_date_range(DateRange(start=start, end=end), months_per_chunk=4)
            return {
                "minimum_api_calls": len(segments),
                "basis": f"1 channel over {len(segments)} segments (1 call per 4-month segment)",
                "effective_start_date": start,
                "effective_end_date": end,
                "uses_period": True,
            }
        return {"minimum_api_calls": 0, "basis": "up to date", "effective_start_date": start, "effective_end_date": end, "uses_period": True}
    if table == "traffic_sources_daily":
        if not range_videos:
            return {"minimum_api_calls": 0, "basis": "no videos/date range", "effective_start_date": None, "effective_end_date": None, "uses_period": True}
        start, end = range_videos
        if not deep_sync:
            latest_row = conn.execute("SELECT MAX(date) AS latest FROM traffic_sources_daily").fetchone()
            latest = str(latest_row["latest"]) if latest_row and latest_row["latest"] else None
            latest_date = _to_date(latest)
            if latest_date:
                next_day = (latest_date + timedelta(days=1)).isoformat()
                if next_day > start:
                    start = next_day
        if _to_date(start) and _to_date(end) and _to_date(start) <= _to_date(end):
            segments = chunk_date_range(DateRange(start=start, end=end), months_per_chunk=12)
            return {
                "minimum_api_calls": len(segments),
                "basis": f"1 channel over {len(segments)} segments (1 call per 12-month segment)",
                "effective_start_date": start,
                "effective_end_date": end,
                "uses_period": True,
            }
        return {"minimum_api_calls": 0, "basis": "up to date", "effective_start_date": start, "effective_end_date": end, "uses_period": True}
    if table == "playlist_daily_analytics":
        if not range_playlists:
            return {"minimum_api_calls": 0, "basis": "no playlists/date range", "effective_start_date": None, "effective_end_date": None, "uses_period": True}
        start, end = range_playlists
        latest_map = {} if deep_sync else _get_latest_by_id(conn, "playlist_daily_analytics", "playlist_id")
        calls, playlist_count, segment_count = _estimate_segment_calls_with_context(playlist_rows, latest_map, start, end, 4)
        return {
            "minimum_api_calls": calls,
            "basis": f"{playlist_count} playlists over {segment_count} segments (1 call per playlist per 4-month segment)",
            "effective_start_date": start,
            "effective_end_date": end,
            "uses_period": True,
        }
    if table == "video_analytics":
        if not range_videos:
            return {"minimum_api_calls": 0, "basis": "no videos/date range", "effective_start_date": None, "effective_end_date": None, "uses_period": True}
        start, end = range_videos
        latest_map = {} if deep_sync else _get_latest_by_id(conn, "video_analytics", "video_id")
        calls, video_count, segment_count = _estimate_segment_calls_with_context(video_rows, latest_map, start, end, 4)
        return {
            "minimum_api_calls": calls,
            "basis": f"{video_count} videos over {segment_count} segments (1 call per video per 4-month segment)",
            "effective_start_date": start,
            "effective_end_date": end,
            "uses_period": True,
        }
    if table == "video_traffic_source":
        if not range_videos:
            return {"minimum_api_calls": 0, "basis": "no videos/date range", "effective_start_date": None, "effective_end_date": None, "uses_period": True}
        start, end = range_videos
        latest_map = {} if deep_sync else _get_latest_by_id(conn, "video_traffic_source", "video_id")
        calls, video_count, segment_count = _estimate_segment_calls_with_context(video_rows, latest_map, start, end, 4)
        return {
            "minimum_api_calls": calls,
            "basis": f"{video_count} videos over {segment_count} segments (1 call per video per 4-month segment)",
            "effective_start_date": start,
            "effective_end_date": end,
            "uses_period": True,
        }
    if table == "video_search_insights":
        if not range_videos:
            return {"minimum_api_calls": 0, "basis": "no videos/date range", "effective_start_date": None, "effective_end_date": None, "uses_period": True}
        start, end = range_videos
        latest_map = {} if deep_sync else _get_latest_by_id(conn, "video_search_insights", "video_id")
        calls, video_count, day_count = _estimate_search_calls_with_context(video_rows, latest_map, start, end)
        return {
            "minimum_api_calls": calls,
            "basis": f"{video_count} videos across {day_count} video-days (1 call per video-day, minimum, no pagination)",
            "effective_start_date": start,
            "effective_end_date": end,
            "uses_period": True,
        }
    return {
        "minimum_api_calls": 0,
        "basis": "table is DB-only / no direct Google API sync stage",
        "effective_start_date": None,
        "effective_end_date": None,
        "uses_period": False,
    }


def _resolve_table_date_bounds(conn: sqlite3.Connection, table_name: str) -> dict:
    """Return oldest/newest date values for the most suitable date-like column in a table."""
    info_rows = conn.execute(f'PRAGMA table_info("{table_name}")').fetchall()
    if not info_rows:
        return {"column": None, "oldest": None, "newest": None}
    columns = [str(row["name"]) for row in info_rows if row["name"]]
    preferred = [
        "date",
        "published_at",
        "updated_at",
        "started_at",
        "finished_at",
        "subscribed_at",
        "first_commented_at",
        "last_commented_at",
        "video_published_at",
    ]
    candidates = [name for name in preferred if name in columns]
    candidates.extend(
        name
        for name in columns
        if name not in candidates and (name.endswith("_at") or "date" in name.lower())
    )
    for column_name in candidates:
        try:
            row = conn.execute(
                f'SELECT MIN(date("{column_name}")) AS oldest, MAX(date("{column_name}")) AS newest FROM "{table_name}"'
            ).fetchone()
        except sqlite3.OperationalError:
            continue
        if row and (row["oldest"] or row["newest"]):
            return {
                "column": column_name,
                "oldest": str(row["oldest"]) if row["oldest"] else None,
                "newest": str(row["newest"]) if row["newest"] else None,
            }
    return {"column": None, "oldest": None, "newest": None}


def _expected_value_label(column_name: str, declared_type: str, not_null: int) -> str:
    """Build a human-readable expected-value hint for one DB column."""
    lowered_name = (column_name or "").lower()
    lowered_type = (declared_type or "").upper()
    nullable_text = "required" if int(not_null or 0) == 1 else "nullable"
    if "INT" in lowered_type:
        if lowered_name.startswith("is_") or lowered_name.startswith("has_"):
            return f"0 or 1 boolean flag ({nullable_text})"
        return f"whole number ({nullable_text})"
    if any(token in lowered_type for token in ("REAL", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC")):
        return f"decimal number ({nullable_text})"
    if "BLOB" in lowered_type:
        return f"binary value ({nullable_text})"
    if "CHAR" in lowered_type or "CLOB" in lowered_type or "TEXT" in lowered_type or lowered_type == "":
        if lowered_name.endswith("_at") or "date" in lowered_name:
            return f"date/time text (ISO-like) ({nullable_text})"
        if lowered_name.endswith("_id") or lowered_name == "id":
            return f"identifier text ({nullable_text})"
        return f"text value ({nullable_text})"
    return f"value of type {declared_type or 'TEXT'} ({nullable_text})"


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


@router.post("/sync/stop")
def stop_sync() -> dict:
    """Request graceful stop for current sync (after current API call returns)."""
    accepted = request_sync_stop()
    return {"accepted": accepted}


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


@router.get("/audience")
def list_audience(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    q: str | None = None,
    subscriber_only: bool | None = None,
    sort_by: str = Query(default="last_commented_at"),
    direction: str = Query(default="desc"),
) -> dict:
    """Return audience rows with optional search/filter and pagination."""
    where_clauses = []
    params: list[object] = []
    if q:
        where_clauses.append("a.display_name LIKE ?")
        params.append(f"%{q}%")
    if subscriber_only is True:
        where_clauses.append("a.is_public_subscriber = 1")
    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    sort_map = {
        "subscribed_at": "a.subscribed_at",
        "first_commented_at": "a.first_commented_at",
        "last_commented_at": "a.last_commented_at",
        "comment_count": "a.comment_count",
        "total_comment_likes": "COALESCE(cs.total_comment_likes, 0)",
        "total_comment_replies": "COALESCE(cs.total_comment_replies, 0)",
    }
    sort_column = sort_map.get(sort_by, "a.last_commented_at")
    sort_dir = "ASC" if direction.lower() == "asc" else "DESC"
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                a.*,
                COALESCE(cs.total_comment_likes, 0) AS total_comment_likes,
                COALESCE(cs.total_comment_replies, 0) AS total_comment_replies
            FROM audience a
            LEFT JOIN (
                SELECT
                    author_channel_id AS channel_id,
                    SUM(COALESCE(like_count, 0)) AS total_comment_likes,
                    SUM(COALESCE(reply_count, 0)) AS total_comment_replies
                FROM comments
                WHERE author_channel_id IS NOT NULL AND author_channel_id != ''
                GROUP BY author_channel_id
            ) cs ON cs.channel_id = a.channel_id
            {where_sql}
            ORDER BY ({sort_column} IS NULL) ASC, {sort_column} {sort_dir}, a.channel_id ASC
            LIMIT ? OFFSET ?
            """,
            tuple(params + [limit, offset]),
        ).fetchall()
        total_row = conn.execute(
            f"SELECT COUNT(*) AS total FROM audience a {where_sql}",
            tuple(params),
        ).fetchone()
    total = total_row["total"] if total_row and total_row["total"] is not None else 0
    return {"items": [row_to_dict(row) for row in rows], "total": total}


@router.get("/audience/active")
def list_active_audience(days: int = Query(default=90, ge=1, le=3650), limit: int = Query(default=10, ge=1, le=100)) -> dict:
    """Return most active audience members by comment activity within the last N days."""
    end_date = datetime.now(UTC).date()
    start_date = end_date - timedelta(days=days - 1)
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                c.author_channel_id AS channel_id,
                COALESCE(NULLIF(a.display_name, ''), MAX(COALESCE(c.author_name, '')), '@Unknown') AS display_name,
                COALESCE(NULLIF(a.profile_image_url, ''), MAX(COALESCE(c.author_profile_image_url, '')), '') AS profile_image_url,
                COALESCE(a.is_public_subscriber, 0) AS is_public_subscriber,
                COUNT(*) AS comments_count,
                COALESCE(SUM(COALESCE(c.like_count, 0)), 0) AS likes_count,
                COALESCE(SUM(COALESCE(c.reply_count, 0)), 0) AS replies_count,
                MAX(c.published_at) AS last_comment_at
            FROM comments c
            LEFT JOIN audience a ON a.channel_id = c.author_channel_id
            WHERE c.author_channel_id IS NOT NULL
              AND c.author_channel_id != ''
              AND date(c.published_at) >= ?
              AND date(c.published_at) <= ?
            GROUP BY c.author_channel_id
            ORDER BY comments_count DESC, likes_count DESC, last_comment_at DESC
            LIMIT ?
            """,
            (start_date.isoformat(), end_date.isoformat(), limit),
        ).fetchall()
    return {
        "items": [row_to_dict(row) for row in rows],
        "range": {
            "days": days,
            "start_date": start_date.isoformat(),
            "end_date": end_date.isoformat(),
        },
    }


@router.get("/audience/{channel_id}")
def get_audience_detail(channel_id: str) -> dict:
    """Return one audience row and related comment totals for a channel ID."""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM audience WHERE channel_id = ?", (channel_id,)).fetchone()
        if row is None:
            raise HTTPException(status_code=404, detail="Audience member not found.")
        stats_row = conn.execute(
            """
            SELECT
                COUNT(*) AS total_comments,
                COUNT(DISTINCT video_id) AS distinct_videos,
                COALESCE(SUM(COALESCE(like_count, 0)), 0) AS total_comment_likes,
                MIN(published_at) AS first_comment_at,
                MAX(published_at) AS last_comment_at
            FROM comments
            WHERE author_channel_id = ?
            """,
            (channel_id,),
        ).fetchone()
    return {
        "item": row_to_dict(row),
        "stats": row_to_dict(stats_row) if stats_row else {},
    }


@router.get("/playlists")
def list_playlists(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    q: str | None = None,
    privacy_status: str | None = None,
    sort: str | None = None,
    direction: str | None = None,
) -> dict:
    """Return playlists with optional filters and pagination."""
    where_clauses = []
    params: list[object] = []
    if q:
        where_clauses.append("p.title LIKE ?")
        params.append(f"%{q}%")
    if privacy_status:
        where_clauses.append("p.privacy_status = ?")
        params.append(privacy_status)
    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    sort_map = {
        "title": "p.title",
        "published_at": "p.published_at",
        "item_count": "p.item_count",
        "total_playlist_views": "total_playlist_views",
        "total_content_views": "total_content_views",
        "last_item_added_at": "last_item_added_at",
    }
    sort_column = sort_map.get(sort or "", "last_item_added_at")
    sort_dir = "ASC" if (direction or "").lower() == "asc" else "DESC"
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                p.*,
                (
                    SELECT MAX(pi.published_at)
                    FROM playlist_items pi
                    WHERE pi.playlist_id = p.id
                ) AS last_item_added_at,
                (
                    SELECT COALESCE(SUM(pda.playlist_views), 0)
                    FROM playlist_daily_analytics pda
                    WHERE pda.playlist_id = p.id
                ) AS total_playlist_views,
                (
                    SELECT COALESCE(SUM(COALESCE(v.view_count, 0)), 0)
                    FROM playlist_items pi
                    LEFT JOIN videos v ON v.id = pi.video_id
                    WHERE pi.playlist_id = p.id
                ) AS total_content_views
            FROM playlists p
            {where_sql}
            ORDER BY {sort_column} {sort_dir}
            LIMIT ? OFFSET ?
            """,
            tuple(params + [limit, offset]),
        ).fetchall()
        total_row = conn.execute(
            f"SELECT COUNT(*) AS total FROM playlists p {where_sql}",
            tuple(params),
        ).fetchone()
    total = total_row["total"] if total_row and total_row["total"] is not None else 0
    return {"items": [row_to_dict(row) for row in rows], "total": total}


@router.get("/playlists/{playlist_id}")
def get_playlist(playlist_id: str) -> dict:
    """Return one playlist row by ID."""
    with get_connection() as conn:
        row = conn.execute("SELECT * FROM playlists WHERE id = ?", (playlist_id,)).fetchone()
    if row is None:
        raise HTTPException(status_code=404, detail="Playlist not found.")
    return {"item": row_to_dict(row)}


@router.get("/playlists/{playlist_id}/items")
def list_playlist_items(
    playlist_id: str,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    q: str | None = None,
    sort_by: str = Query(default="position"),
    direction: str = Query(default="asc"),
) -> dict:
    """Return playlist items with optional text filter and pagination."""
    recent_end = datetime.now(UTC).date()
    recent_start = recent_end - timedelta(days=89)
    recent_start_str = recent_start.isoformat()
    recent_end_str = recent_end.isoformat()
    with get_connection() as conn:
        exists = conn.execute("SELECT 1 FROM playlists WHERE id = ? LIMIT 1", (playlist_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Playlist not found.")
        where_clauses = ["pi.playlist_id = ?"]
        params: list[object] = [playlist_id]
        if q:
            where_clauses.append("(pi.title LIKE ? OR pi.video_id LIKE ?)")
            params.extend([f"%{q}%", f"%{q}%"])
        where_sql = "WHERE " + " AND ".join(where_clauses)
        sort_map = {
            "position": "pi.position",
            "published_at": "pi.published_at",
            "title": "COALESCE(pi.title, '')",
            "views": "COALESCE(v.view_count, 0)",
            "comments": "COALESCE(v.comment_count, 0)",
            "likes": "COALESCE(v.like_count, 0)",
            "recent_views": "COALESCE(rv.recent_views, 0)",
        }
        sort_column = sort_map.get(sort_by, "pi.position")
        sort_dir = "DESC" if direction.lower() == "desc" else "ASC"
        rows = conn.execute(
            f"""
            SELECT
                pi.*,
                v.title AS video_title,
                v.description AS video_description,
                v.thumbnail_url AS video_thumbnail_url,
                v.privacy_status AS video_privacy_status,
                v.view_count AS video_view_count,
                v.comment_count AS video_comment_count,
                v.like_count AS video_like_count,
                COALESCE(rv.recent_views, 0) AS video_recent_views,
                COALESCE(va.total_watch_time_minutes, 0) AS video_watch_time_minutes,
                COALESCE(va.avg_view_duration_seconds, 0) AS video_average_view_duration_seconds
            FROM playlist_items pi
            LEFT JOIN videos v ON v.id = pi.video_id
            LEFT JOIN (
                SELECT
                    video_id,
                    SUM(COALESCE(views, 0)) AS recent_views
                FROM video_analytics
                WHERE date >= ? AND date <= ?
                GROUP BY video_id
            ) rv ON rv.video_id = pi.video_id
            LEFT JOIN (
                SELECT
                    video_id,
                    SUM(COALESCE(watch_time_minutes, 0)) AS total_watch_time_minutes,
                    AVG(COALESCE(average_view_duration_seconds, 0)) AS avg_view_duration_seconds
                FROM video_analytics
                GROUP BY video_id
            ) va ON va.video_id = pi.video_id
            {where_sql}
            ORDER BY {sort_column} {sort_dir}, pi.id ASC
            LIMIT ? OFFSET ?
            """,
            tuple([recent_start_str, recent_end_str] + params + [limit, offset]),
        ).fetchall()
        total_row = conn.execute(
            f"SELECT COUNT(*) AS total FROM playlist_items pi {where_sql}",
            tuple(params),
        ).fetchone()
    total = total_row["total"] if total_row and total_row["total"] is not None else 0
    return {"items": [row_to_dict(row) for row in rows], "total": total}


@router.get("/analytics/playlist-daily")
def list_playlist_daily(playlist_id: str, start_date: str, end_date: str) -> dict:
    """Return daily playlist-view analytics rows for one playlist and date range."""
    with get_connection() as conn:
        exists = conn.execute("SELECT 1 FROM playlists WHERE id = ? LIMIT 1", (playlist_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Playlist not found.")
        rows = conn.execute(
            """
            SELECT
                date AS day,
                SUM(COALESCE(playlist_views, 0)) AS views,
                SUM(COALESCE(playlist_estimated_minutes_watched, 0)) AS watch_time_minutes,
                AVG(COALESCE(playlist_average_view_duration_seconds, 0)) AS average_view_duration_seconds,
                SUM(COALESCE(playlist_starts, 0)) AS playlist_starts,
                AVG(COALESCE(views_per_playlist_start, 0)) AS views_per_playlist_start,
                AVG(COALESCE(average_time_in_playlist_seconds, 0)) AS average_time_in_playlist_seconds
            FROM playlist_daily_analytics
            WHERE playlist_id = ? AND date >= ? AND date <= ?
            GROUP BY date
            ORDER BY date ASC
            """,
            (playlist_id, start_date, end_date),
        ).fetchall()
    items = []
    for row in rows:
        item = row_to_dict(row)
        item["estimated_revenue"] = 0
        item["subscribers_gained"] = 0
        item["subscribers_lost"] = 0
        items.append(item)
    totals = {
        "views": sum(item.get("views") or 0 for item in items),
        "watch_time_minutes": sum(item.get("watch_time_minutes") or 0 for item in items),
        "estimated_revenue": 0,
        "subscribers_gained": 0,
        "subscribers_lost": 0,
        "average_view_duration_seconds": (
            sum(item.get("average_view_duration_seconds") or 0 for item in items) / len(items)
            if items
            else 0
        ),
        "playlist_starts": sum(item.get("playlist_starts") or 0 for item in items),
        "views_per_playlist_start": (
            sum(item.get("views_per_playlist_start") or 0 for item in items) / len(items)
            if items
            else 0
        ),
        "average_time_in_playlist_seconds": (
            sum(item.get("average_time_in_playlist_seconds") or 0 for item in items) / len(items)
            if items
            else 0
        ),
    }
    return {"items": items, "totals": totals}


@router.get("/analytics/playlist-video-daily")
def list_playlist_video_daily(playlist_id: str, start_date: str, end_date: str) -> dict:
    """Return daily video analytics summed across videos that are in a playlist."""
    with get_connection() as conn:
        exists = conn.execute("SELECT 1 FROM playlists WHERE id = ? LIMIT 1", (playlist_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Playlist not found.")
        rows = conn.execute(
            """
            WITH playlist_videos AS (
                SELECT DISTINCT video_id
                FROM playlist_items
                WHERE playlist_id = ? AND video_id IS NOT NULL
            )
            SELECT
                a.date AS day,
                SUM(COALESCE(a.views, 0)) AS views,
                SUM(COALESCE(a.watch_time_minutes, 0)) AS watch_time_minutes,
                SUM(COALESCE(a.estimated_revenue, 0)) AS estimated_revenue,
                SUM(COALESCE(a.subscribers_gained, 0)) AS subscribers_gained,
                SUM(COALESCE(a.subscribers_lost, 0)) AS subscribers_lost
            FROM video_analytics a
            JOIN playlist_videos pv ON pv.video_id = a.video_id
            WHERE a.date >= ? AND a.date <= ?
            GROUP BY a.date
            ORDER BY a.date ASC
            """,
            (playlist_id, start_date, end_date),
        ).fetchall()
    items = [row_to_dict(row) for row in rows]
    totals = {
        "views": sum(item.get("views") or 0 for item in items),
        "watch_time_minutes": sum(item.get("watch_time_minutes") or 0 for item in items),
        "estimated_revenue": sum(item.get("estimated_revenue") or 0 for item in items),
        "subscribers_gained": sum(item.get("subscribers_gained") or 0 for item in items),
        "subscribers_lost": sum(item.get("subscribers_lost") or 0 for item in items),
    }
    return {"items": items, "totals": totals}


@router.get("/comments")
def list_comments(
    video_id: str | None = None,
    author_channel_id: str | None = None,
    published_after: str | None = None,
    published_before: str | None = None,
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    sort_by: str = Query(default="published_at"),
    direction: str = Query(default="desc"),
) -> dict:
    """Return comments with optional video/author filters and pagination."""
    where_clauses = []
    params: list[object] = []
    if video_id:
        where_clauses.append("c.video_id = ?")
        params.append(video_id)
    if author_channel_id:
        where_clauses.append("c.author_channel_id = ?")
        params.append(author_channel_id)
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
    total = total_row["total"] if total_row and total_row["total"] is not None else 0
    return {"items": items, "total": total}


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
        SELECT
            video_id,
            date,
            engaged_views,
            views,
            watch_time_minutes,
            estimated_revenue,
            estimated_ad_revenue,
            gross_revenue,
            estimated_red_partner_revenue,
            average_view_duration_seconds,
            average_view_percentage,
            likes,
            comments,
            shares,
            monetized_playbacks,
            playback_based_cpm,
            ad_impressions,
            cpm,
            subscribers_gained,
            subscribers_lost
        FROM video_analytics
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
            "SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM video_analytics"
        ).fetchone()
        channel_row = conn.execute(
            "SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM channel_analytics"
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
                SUM(a.ad_impressions) AS ad_impressions,
                SUM(a.monetized_playbacks) AS monetized_playbacks,
                CASE
                    WHEN SUM(COALESCE(a.ad_impressions, 0)) > 0
                    THEN SUM(COALESCE(a.cpm, 0) * COALESCE(a.ad_impressions, 0)) / SUM(COALESCE(a.ad_impressions, 0))
                    ELSE AVG(a.cpm)
                END AS cpm,
                SUM(a.average_view_duration_seconds) AS average_view_duration_seconds,
                SUM(a.likes) AS likes,
                SUM(a.comments) AS comments,
                SUM(a.shares) AS shares,
                SUM(a.subscribers_gained) AS subscribers_gained,
                SUM(a.subscribers_lost) AS subscribers_lost
            FROM video_analytics a
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
        "ad_impressions": sum(item.get("ad_impressions") or 0 for item in items),
        "monetized_playbacks": sum(item.get("monetized_playbacks") or 0 for item in items),
        "cpm": None,
        "subscribers_gained": sum(item.get("subscribers_gained") or 0 for item in items),
        "subscribers_lost": sum(item.get("subscribers_lost") or 0 for item in items),
    }
    if totals["ad_impressions"] > 0:
        totals["cpm"] = sum(
            (item.get("cpm") or 0) * (item.get("ad_impressions") or 0) for item in items
        ) / totals["ad_impressions"]
    else:
        totals["cpm"] = sum(item.get("cpm") or 0 for item in items) / len(items) if items else 0
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
                engaged_views,
                views,
                watch_time_minutes,
                estimated_revenue,
                estimated_ad_revenue,
                gross_revenue,
                estimated_red_partner_revenue,
                average_view_duration_seconds,
                average_view_percentage,
                likes,
                dislikes,
                comments,
                shares,
                monetized_playbacks,
                playback_based_cpm,
                ad_impressions,
                cpm,
                impressions,
                impressions_ctr,
                subscribers_gained,
                subscribers_lost
            FROM channel_analytics
            WHERE date >= ? AND date <= ?
            ORDER BY date ASC
            """,
            (start_date, end_date),
        ).fetchall()

    items = [row_to_dict(row) for row in rows]
    totals = {
        "engaged_views": sum(item.get("engaged_views") or 0 for item in items),
        "views": sum(item.get("views") or 0 for item in items),
        "watch_time_minutes": sum(item.get("watch_time_minutes") or 0 for item in items),
        "estimated_revenue": sum(item.get("estimated_revenue") or 0 for item in items),
        "estimated_ad_revenue": sum(item.get("estimated_ad_revenue") or 0 for item in items),
        "gross_revenue": sum(item.get("gross_revenue") or 0 for item in items),
        "estimated_red_partner_revenue": sum(item.get("estimated_red_partner_revenue") or 0 for item in items),
        "average_view_duration_seconds": sum(item.get("average_view_duration_seconds") or 0 for item in items),
        "average_view_percentage": sum(item.get("average_view_percentage") or 0 for item in items),
        "likes": sum(item.get("likes") or 0 for item in items),
        "dislikes": sum(item.get("dislikes") or 0 for item in items),
        "comments": sum(item.get("comments") or 0 for item in items),
        "shares": sum(item.get("shares") or 0 for item in items),
        "monetized_playbacks": sum(item.get("monetized_playbacks") or 0 for item in items),
        "playback_based_cpm": sum(item.get("playback_based_cpm") or 0 for item in items),
        "ad_impressions": sum(item.get("ad_impressions") or 0 for item in items),
        "cpm": sum(item.get("cpm") or 0 for item in items),
        "impressions": sum(item.get("impressions") or 0 for item in items),
        "impressions_ctr": sum(item.get("impressions_ctr") or 0 for item in items),
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


@router.get("/playlists/{playlist_id}/published")
def list_playlist_published_dates(playlist_id: str, start_date: str, end_date: str) -> dict:
    """Return published video titles by date for one playlist within a range."""
    with get_connection() as conn:
        exists = conn.execute("SELECT 1 FROM playlists WHERE id = ? LIMIT 1", (playlist_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Playlist not found.")
        rows = conn.execute(
            """
            SELECT
                date(COALESCE(v.published_at, pi.video_published_at)) AS day,
                COALESCE(v.title, pi.title, '(untitled)') AS title,
                COALESCE(v.published_at, pi.video_published_at, '') AS published_at,
                COALESCE(v.thumbnail_url, pi.thumbnail_url, '') AS thumbnail_url,
                COALESCE(v.content_type, '') AS content_type
            FROM playlist_items pi
            LEFT JOIN videos v ON v.id = pi.video_id
            WHERE pi.playlist_id = ?
              AND COALESCE(v.published_at, pi.video_published_at) IS NOT NULL
              AND date(COALESCE(v.published_at, pi.video_published_at)) >= ?
              AND date(COALESCE(v.published_at, pi.video_published_at)) <= ?
            ORDER BY day ASC, published_at ASC
            """,
            (playlist_id, start_date, end_date),
        ).fetchall()
    grouped: dict[str, list[dict]] = {}
    for row in rows:
        day = row["day"]
        if not day:
            continue
        grouped.setdefault(day, []).append(
            {
                "title": row["title"] or "(untitled)",
                "published_at": row["published_at"] or "",
                "thumbnail_url": row["thumbnail_url"] or "",
                "content_type": row["content_type"] or "",
            }
        )
    items = [{"day": day, "items": bucket, "count": len(bucket)} for day, bucket in grouped.items()]
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
def list_top_content(
    start_date: str,
    end_date: str,
    limit: int = 10,
    content_type: str | None = None,
    privacy_status: str | None = None,
    sort_by: str = Query(default="views"),
    direction: str = Query(default="desc"),
) -> dict:
    """Return content in a date range, sorted by supported metric/date, optionally filtered by content type."""
    where_sql = "a.date >= ? AND a.date <= ?"
    params: list[object] = [start_date, end_date]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)
    if privacy_status:
        where_sql += " AND v.privacy_status = ?"
        params.append(privacy_status)
    sort_map = {
        "views": "views",
        "estimated_revenue": "estimated_revenue",
        "published_at": "COALESCE(v.published_at, '')",
    }
    sort_column = sort_map.get(sort_by, "views")
    sort_dir = "ASC" if direction.lower() == "asc" else "DESC"
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
                SUM(a.watch_time_minutes) AS watch_time_minutes,
                SUM(a.estimated_revenue) AS estimated_revenue,
                AVG(a.average_view_duration_seconds) AS avg_view_duration_seconds
            FROM video_analytics a
            JOIN videos v ON v.id = a.video_id
            WHERE {where_sql}
            GROUP BY v.id
            ORDER BY {sort_column} {sort_dir}, views DESC
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
                "watch_time_minutes": row["watch_time_minutes"] or 0,
                "estimated_revenue": row["estimated_revenue"] or 0,
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
                "SELECT id, started_at, finished_at, status, COALESCE(error, error_message) AS error, "
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
                "SELECT id, started_at, finished_at, status, COALESCE(error, error_message) AS error, "
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
        total_playlists = conn.execute("SELECT COUNT(*) AS count FROM playlists").fetchone()[0]
        total_audience = conn.execute("SELECT COUNT(*) AS count FROM audience").fetchone()[0]
        total_views_row = conn.execute("SELECT SUM(views) AS total FROM channel_analytics").fetchone()
        total_views = total_views_row["total"] if total_views_row and total_views_row["total"] is not None else 0
        total_comments_row = conn.execute("SELECT COUNT(*) AS count FROM comments").fetchone()
        total_comments = total_comments_row["count"] if total_comments_row and total_comments_row["count"] is not None else 0
        earliest_row = conn.execute("SELECT MIN(date) AS earliest FROM video_analytics").fetchone()
        latest_row = conn.execute("SELECT MAX(date) AS latest FROM video_analytics").fetchone()
        earliest_date = earliest_row["earliest"] if earliest_row else None
        latest_date = latest_row["latest"] if latest_row else None
        daily_rows = conn.execute("SELECT COUNT(*) AS count FROM video_analytics").fetchone()
        channel_rows = conn.execute("SELECT COUNT(*) AS count FROM channel_analytics").fetchone()
        traffic_rows = conn.execute("SELECT COUNT(*) AS count FROM traffic_sources_daily").fetchone()
        video_traffic_rows = conn.execute("SELECT COUNT(*) AS count FROM video_traffic_source").fetchone()
        video_search_rows = conn.execute("SELECT COUNT(*) AS count FROM video_search_insights").fetchone()
        playlist_analytics_rows = conn.execute("SELECT COUNT(*) AS count FROM playlist_daily_analytics").fetchone()
        daily_analytics_rows = daily_rows["count"] if daily_rows and daily_rows["count"] is not None else 0
        channel_daily_rows = channel_rows["count"] if channel_rows and channel_rows["count"] is not None else 0
        traffic_sources_rows = traffic_rows["count"] if traffic_rows and traffic_rows["count"] is not None else 0
        video_traffic_source_rows = (
            video_traffic_rows["count"] if video_traffic_rows and video_traffic_rows["count"] is not None else 0
        )
        video_search_rows_total = (
            video_search_rows["count"] if video_search_rows and video_search_rows["count"] is not None else 0
        )
        total_playlist_analytics_rows = (
            playlist_analytics_rows["count"]
            if playlist_analytics_rows and playlist_analytics_rows["count"] is not None
            else 0
        )
        table_storage = _get_table_storage(conn, db_size_bytes)
        table_row_counts = _get_table_row_counts(conn)
    return {
        "db_size_bytes": db_size_bytes,
        "total_uploads": total_uploads,
        "total_playlists": total_playlists,
        "total_audience": total_audience,
        "total_views": total_views,
        "total_comments": total_comments,
        "earliest_date": earliest_date,
        "latest_date": latest_date,
        "daily_analytics_rows": daily_analytics_rows,
        "channel_daily_rows": channel_daily_rows,
        "traffic_sources_rows": traffic_sources_rows,
        "video_traffic_source_rows": video_traffic_source_rows,
        "video_search_rows": video_search_rows_total,
        "playlist_analytics_rows": total_playlist_analytics_rows,
        "table_storage": table_storage,
        "table_row_counts": table_row_counts,
    }


@router.get("/stats/table-details")
def get_table_details(table: str) -> dict:
    """Return date bounds and column expectations for one table."""
    if not table:
        raise HTTPException(status_code=400, detail="Missing table name.")
    with get_connection() as conn:
        exists_row = conn.execute(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ? AND name NOT LIKE 'sqlite_%'",
            (table,),
        ).fetchone()
        if not exists_row:
            raise HTTPException(status_code=404, detail="Table not found.")
        info_rows = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
        columns = [
            {
                "name": str(row["name"]),
                "declared_type": str(row["type"] or "TEXT"),
                "expected_value": _expected_value_label(str(row["name"]), str(row["type"] or ""), int(row["notnull"] or 0)),
            }
            for row in info_rows
        ]
        bounds = _resolve_table_date_bounds(conn, table)
    return {
        "table": table,
        "date_column": bounds["column"],
        "oldest_item_date": bounds["oldest"],
        "newest_item_date": bounds["newest"],
        "columns": columns,
    }


@router.get("/stats/table-api-calls")
def get_table_api_calls(
    table: str,
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> dict:
    """Estimate minimum Google API calls for a selected table and sync period."""
    if not table:
        raise HTTPException(status_code=400, detail="Missing table name.")
    with get_connection() as conn:
        exists_row = conn.execute(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ? AND name NOT LIKE 'sqlite_%'",
            (table,),
        ).fetchone()
        if not exists_row:
            raise HTTPException(status_code=404, detail="Table not found.")
        estimate = _estimate_min_api_calls_for_table(conn, table, start_date, end_date, deep_sync)
    return {
        "table": table,
        "deep_sync": deep_sync,
        "minimum_api_calls": int(estimate["minimum_api_calls"]),
        "basis": estimate["basis"],
    }

