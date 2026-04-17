"""Video-related API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException, Query

from src.database.db import get_connection, row_to_dict

router = APIRouter()


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
    """Return videos with optional filters and pagination. Uses semantic similarity for text search."""
    where_clauses = []
    params: list[object] = []

    # Don't include q in where_clauses; handle it separately with semantic similarity
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
            SELECT id, title, title_embedding, published_at, view_count, comment_count, like_count FROM videos
            {where_sql}
        """
        all_rows = conn.execute(query, tuple(params)).fetchall()

    # If q is provided, filter by matching against title or video ID
    if q:
        q_lower = q.lower()
        filtered_rows = []
        for row in all_rows:
            title = (row["title"] or "").lower()
            video_id = (row["id"] or "").lower()
            # Include if search query matches title or video ID
            if q_lower in title or q_lower in video_id:
                filtered_rows.append(row)
        all_rows = filtered_rows

    # Sort by the requested column
    sort_key_func = lambda row: row[sort_column] if row[sort_column] is not None else (float('-inf') if sort_dir == 'ASC' else float('inf'))
    all_rows.sort(key=sort_key_func, reverse=(sort_dir == 'DESC'))

    # Fetch full rows for pagination
    with get_connection() as conn:
        if all_rows:
            # Get the IDs of videos after pagination
            video_ids = [row["id"] for row in all_rows[offset : offset + limit]]
            if video_ids:
                placeholders = ",".join("?" * len(video_ids))
                full_query = f"SELECT * FROM videos WHERE id IN ({placeholders})"
                full_rows = conn.execute(full_query, video_ids).fetchall()
                # Preserve the order from scored_rows
                rows_by_id = {row["id"]: row for row in full_rows}
                rows = [rows_by_id[vid] for vid in video_ids if vid in rows_by_id]
            else:
                rows = []
        else:
            rows = []

    total = len(all_rows)
    return {"items": [row_to_dict(row) for row in rows], "total": total}


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
            SELECT id AS video_id, date(published_at) AS day, title, published_at, thumbnail_url, content_type
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
        content_type_value = row["content_type"] or ""
        grouped.setdefault(day, []).append(
            {
                "video_id": row["video_id"] or "",
                "title": title,
                "published_at": published_at,
                "thumbnail_url": thumbnail_url,
                "content_type": content_type_value,
            }
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
