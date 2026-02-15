"""Comment-related API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query

from src.database.db import get_connection, row_to_dict

router = APIRouter()


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
