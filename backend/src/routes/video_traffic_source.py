from __future__ import annotations

from fastapi import APIRouter, Query
from src.database.db import get_connection, row_to_dict

router = APIRouter()


@router.get("/analytics/video-traffic-sources")
def list_video_traffic_sources(
    start_date: str,
    end_date: str,
    content_type: str | None = None,
    video_ids: str | None = None,
) -> dict:
    """Return video-level daily traffic-source rows for a range, optionally filtered by content type or video IDs."""
    where_sql = "vts.date >= ? AND vts.date <= ?"
    params: list[object] = [start_date, end_date]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)
    if video_ids:
        ids = [v.strip() for v in video_ids.split(",") if v.strip()]
        if ids:
            placeholders = ",".join("?" * len(ids))
            where_sql += f" AND vts.video_id IN ({placeholders})"
            params.extend(ids)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                vts.date AS day,
                vts.traffic_source AS traffic_source,
                SUM(vts.views) AS views,
                SUM(vts.watch_time_minutes) AS watch_time_minutes
            FROM video_traffic_source vts
            JOIN videos v ON v.id = vts.video_id
            WHERE {where_sql}
            GROUP BY vts.date, vts.traffic_source
            ORDER BY vts.date ASC, vts.traffic_source ASC
            """,
            tuple(params),
        ).fetchall()
    items = [row_to_dict(row) for row in rows]
    return {"items": items}


@router.get("/analytics/video-traffic-source-top-videos")
def list_video_traffic_source_top_videos(
    start_date: str,
    end_date: str,
    traffic_source: str,
    content_type: str | None = None,
    video_ids: str | None = None,
    limit: int = Query(default=10, ge=1, le=100),
) -> dict:
    """Return top videos for one traffic source within a date range, optionally filtered by content type or video IDs."""
    where_sql = "vts.date >= ? AND vts.date <= ? AND vts.traffic_source = ?"
    params: list[object] = [start_date, end_date, traffic_source]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)
    if video_ids:
        ids = [v.strip() for v in video_ids.split(",") if v.strip()]
        if ids:
            placeholders = ",".join("?" * len(ids))
            where_sql += f" AND vts.video_id IN ({placeholders})"
            params.extend(ids)
    params.append(limit)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                v.id AS video_id,
                COALESCE(v.title, '(untitled)') AS title,
                COALESCE(v.thumbnail_url, '') AS thumbnail_url,
                COALESCE(v.published_at, '') AS published_at,
                SUM(vts.views) AS views,
                SUM(vts.watch_time_minutes) AS watch_time_minutes
            FROM video_traffic_source vts
            JOIN videos v ON v.id = vts.video_id
            WHERE {where_sql}
            GROUP BY v.id
            ORDER BY views DESC, watch_time_minutes DESC
            LIMIT ?
            """,
            tuple(params),
        ).fetchall()
    items = [row_to_dict(row) for row in rows]
    return {"items": items}
