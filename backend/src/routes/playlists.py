"""Playlist-related API endpoints."""

from __future__ import annotations

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, HTTPException, Query

from src.database.db import get_connection, row_to_dict

router = APIRouter()


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
        where_clauses.append("(p.title LIKE ? OR p.id LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
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


@router.get("/playlists/{playlist_id}/video-ids")
def list_playlist_video_ids(playlist_id: str) -> dict:
    """Return all video IDs for a playlist in position order."""
    with get_connection() as conn:
        exists = conn.execute("SELECT 1 FROM playlists WHERE id = ? LIMIT 1", (playlist_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Playlist not found.")
        rows = conn.execute(
            "SELECT video_id FROM playlist_items WHERE playlist_id = ? ORDER BY position ASC, id ASC",
            (playlist_id,),
        ).fetchall()
    return {"items": [row["video_id"] for row in rows]}


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
                COALESCE(v.id, pi.video_id, '') AS video_id,
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
                "video_id": row["video_id"] or "",
                "title": row["title"] or "(untitled)",
                "published_at": row["published_at"] or "",
                "thumbnail_url": row["thumbnail_url"] or "",
                "content_type": row["content_type"] or "",
            }
        )
    items = [{"day": day, "items": bucket, "count": len(bucket)} for day, bucket in grouped.items()]
    return {"items": items}
