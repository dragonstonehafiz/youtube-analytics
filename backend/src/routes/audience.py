"""Audience-related API endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query

from src.database.db import get_connection, row_to_dict

router = APIRouter()


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
            WITH stats AS (
                SELECT
                    author_channel_id,
                    COUNT(*) AS comments_count,
                    COALESCE(SUM(COALESCE(like_count, 0)), 0) AS likes_count,
                    COALESCE(SUM(COALESCE(reply_count, 0)), 0) AS replies_count,
                    MAX(published_at) AS last_comment_at
                FROM comments
                WHERE author_channel_id IS NOT NULL
                  AND author_channel_id != ''
                  AND published_at >= ?
                  AND published_at < ?
                GROUP BY author_channel_id
                ORDER BY comments_count DESC, likes_count DESC, last_comment_at DESC
                LIMIT ?
            )
            SELECT
                s.author_channel_id AS channel_id,
                COALESCE(NULLIF(a.display_name, ''), s.author_channel_id, '@Unknown') AS display_name,
                COALESCE(a.profile_image_url, '') AS profile_image_url,
                COALESCE(a.is_public_subscriber, 0) AS is_public_subscriber,
                s.comments_count,
                s.likes_count,
                s.replies_count,
                s.last_comment_at
            FROM stats s
            LEFT JOIN audience a ON a.channel_id = s.author_channel_id
            """,
            (start_date.isoformat(), (end_date + timedelta(days=1)).isoformat(), limit),
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
