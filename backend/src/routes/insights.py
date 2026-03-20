"""Insights API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, Query
from src.database.db import get_connection, row_to_dict

router = APIRouter()


@router.get("/insights/top-content")
def list_top_content(
    start_date: str,
    end_date: str,
    limit: int = 10,
    content_type: str | None = None,
    privacy_status: str | None = None,
    video_ids: str | None = None,
    sort_by: str = Query(default="views"),
    direction: str = Query(default="desc"),
) -> dict:
    """Return content in a date range, sorted by supported metric/date, optionally filtered by content type and/or video IDs."""
    video_ids_list = []
    if video_ids:
        video_ids_list = [vid.strip() for vid in video_ids.split(',') if vid.strip()]
    where_sql = "a.date >= ? AND a.date <= ?"
    params: list[object] = [start_date, end_date]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)
    if privacy_status:
        where_sql += " AND v.privacy_status = ?"
        params.append(privacy_status)
    if video_ids_list:
        placeholders = ','.join(['?' for _ in video_ids_list])
        where_sql += f" AND v.id IN ({placeholders})"
        params.extend(video_ids_list)
    sort_map = {
        "views": "views",
        "estimated_revenue": "estimated_revenue",
        "published_at": "COALESCE(v.published_at, '')",
    }
    sort_column = sort_map.get(sort_by, "views")
    sort_dir = "ASC" if direction.lower() == "asc" else "DESC"
    params.append(limit)
    with get_connection() as conn:
        if sort_by == "published_at":
            # Optimised path: identify the target video IDs from the videos table first
            # (fast index scan), then aggregate analytics only for those IDs.
            video_where_clauses = []
            video_params: list[object] = []
            if content_type:
                video_where_clauses.append("content_type = ?")
                video_params.append(content_type)
            if privacy_status:
                video_where_clauses.append("privacy_status = ?")
                video_params.append(privacy_status)
            if video_ids_list:
                placeholders = ','.join(['?' for _ in video_ids_list])
                video_where_clauses.append(f"id IN ({placeholders})")
                video_params.extend(video_ids_list)
            video_where_sql = ("WHERE " + " AND ".join(video_where_clauses)) if video_where_clauses else ""
            analytics_where_parts = []
            analytics_params: list[object] = []
            if start_date:
                analytics_where_parts.append("a.date >= ?")
                analytics_params.append(start_date)
            if end_date:
                analytics_where_parts.append("a.date <= ?")
                analytics_params.append(end_date)
            analytics_where_sql = ("AND " + " AND ".join(analytics_where_parts)) if analytics_where_parts else ""
            rows = conn.execute(
                f"""
                WITH top_videos AS (
                    SELECT id, title, published_at, thumbnail_url, duration_seconds
                    FROM videos
                    {video_where_sql}
                    ORDER BY COALESCE(published_at, '') {sort_dir}
                    LIMIT ?
                )
                SELECT
                    tv.id AS video_id,
                    tv.title AS title,
                    tv.published_at AS published_at,
                    tv.thumbnail_url AS thumbnail_url,
                    tv.duration_seconds AS duration_seconds,
                    COALESCE(SUM(a.views), 0) AS views,
                    COALESCE(SUM(a.watch_time_minutes), 0) AS watch_time_minutes,
                    COALESCE(SUM(a.estimated_revenue), 0) AS estimated_revenue,
                    COALESCE(AVG(a.average_view_duration_seconds), 0) AS avg_view_duration_seconds
                FROM top_videos tv
                LEFT JOIN video_analytics a ON a.video_id = tv.id {analytics_where_sql}
                GROUP BY tv.id
                ORDER BY COALESCE(tv.published_at, '') {sort_dir}
                """,
                tuple(video_params + [limit] + analytics_params),
            ).fetchall()
        else:
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


@router.get("/insights/content")
def get_content_insights(
    start_date: str,
    end_date: str,
    content_type: str | None = None,
    playlist_id: str | None = None,
) -> dict:
    """Return aggregate performance insights for all videos in a date range."""
    where_sql = "a.date >= ? AND a.date <= ?"
    params: list[object] = [start_date, end_date]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)

    playlist_join = ""
    if playlist_id:
        playlist_join = "JOIN playlist_items pi ON pi.video_id = v.id AND pi.playlist_id = ?"
        params.insert(0, playlist_id)
        # WHERE params still refer to a.date columns so no reorder needed for them,
        # but playlist param must come before the date params in the JOIN position.
        # Rebuild cleanly:
        params = [playlist_id, start_date, end_date]
        if content_type:
            params.append(content_type)

    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                v.id AS video_id,
                v.title AS title,
                v.published_at AS published_at,
                v.thumbnail_url AS thumbnail_url,
                v.content_type AS content_type,
                v.duration_seconds AS duration_seconds,
                SUM(a.views) AS views,
                AVG(a.average_view_duration_seconds) AS average_view_duration_seconds,
                AVG(a.average_view_percentage) AS average_view_percentage
            FROM video_analytics a
            JOIN videos v ON v.id = a.video_id
            {playlist_join}
            WHERE {where_sql}
            GROUP BY v.id, v.duration_seconds
            ORDER BY views DESC
            """,
            tuple(params),
        ).fetchall()

    empty = {
        "total_videos": 0,
        "in_period_views": 0, "in_period_pct": 0.0,
        "catalog_views": 0, "catalog_pct": 0.0,
        "in_period_videos": [],
        "shortform_views": 0, "shortform_pct": 0.0,
        "longform_views": 0, "longform_pct": 0.0,
        "shortform_video_count": 0,
        "longform_video_count": 0,
        "median_views": 0, "mean_views": 0.0,
        "p90_threshold": 0, "outlier_count": 0, "outlier_videos": [],
        "outlier_share_pct": 0.0, "videos_with_views": 0,
        "all_views": [],
        "all_video_avg_view_durations": [],
        "all_videos": [],
    }
    if not rows:
        return empty

    views_list = [row["views"] or 0 for row in rows]
    avg_view_duration_list = [row["average_view_duration_seconds"] or 0 for row in rows]
    total_views = sum(views_list)
    n = len(rows)

    # "in period" = videos published within the selected date range
    in_period_rows = [row for row in rows if start_date <= (row["published_at"] or "")[:10] <= end_date]
    catalog_rows = [row for row in rows if (row["published_at"] or "")[:10] < start_date]
    in_period_views = sum(row["views"] or 0 for row in in_period_rows)
    catalog_views = sum(row["views"] or 0 for row in catalog_rows)

    shortform_views = sum(row["views"] or 0 for row in rows if (row["content_type"] or "") == "short")
    longform_views = sum(row["views"] or 0 for row in rows if (row["content_type"] or "") != "short")

    shortform_video_count = len([r for r in in_period_rows if (r["content_type"] or "") == "short"])
    longform_video_count = len([r for r in in_period_rows if (r["content_type"] or "") != "short"])

    sorted_views = sorted(views_list)
    median_views = sorted_views[n // 2]
    mean_views = total_views / n

    p90_index = max(0, int(n * 0.9))
    p90_threshold = sorted_views[min(p90_index, n - 1)]
    outlier_rows = [row for row in rows if (row["views"] or 0) >= p90_threshold]
    outlier_views = sum(row["views"] or 0 for row in outlier_rows)

    def video_item(row: object) -> dict:
        return {
            "video_id": row["video_id"],
            "title": row["title"] or "(untitled)",
            "views": row["views"] or 0,
            "thumbnail_url": row["thumbnail_url"] or "",
            "content_type": row["content_type"] or "",
        }

    all_videos = [
        {
            "video_id": row["video_id"],
            "title": row["title"] or "(untitled)",
            "thumbnail_url": row["thumbnail_url"] or "",
            "avg_view_duration_seconds": row["average_view_duration_seconds"] or 0,
            "view_percentage": row["average_view_percentage"] or 0,
            "content_type": row["content_type"] or "",
        }
        for row in rows
    ]

    return {
        "total_videos": n,
        "in_period_views": in_period_views,
        "in_period_pct": round(in_period_views / total_views * 100, 1) if total_views else 0.0,
        "catalog_views": catalog_views,
        "catalog_pct": round(catalog_views / total_views * 100, 1) if total_views else 0.0,
        "in_period_videos": [video_item(r) for r in in_period_rows],
        "shortform_views": shortform_views,
        "shortform_pct": round(shortform_views / total_views * 100, 1) if total_views else 0.0,
        "longform_views": longform_views,
        "longform_pct": round(longform_views / total_views * 100, 1) if total_views else 0.0,
        "shortform_video_count": shortform_video_count,
        "longform_video_count": longform_video_count,
        "median_views": median_views,
        "mean_views": round(mean_views, 1),
        "p90_threshold": p90_threshold,
        "outlier_count": len(outlier_rows),
        "outlier_videos": [video_item(r) for r in outlier_rows],
        "outlier_share_pct": round(outlier_views / total_views * 100, 1) if total_views else 0.0,
        "all_views": views_list,
        "all_video_avg_view_durations": avg_view_duration_list,
        "all_videos": all_videos,
    }


@router.get("/insights/engagement")
def list_engagement_insights(
    start_date: str,
    end_date: str,
    content_type: str | None = None,
    video_ids: str | None = None,
) -> dict:
    """Return engagement insights: total comments, top commented videos, and top subscriber-gaining videos.

    Optionally filter by specific video IDs (comma-separated) or content type.
    """
    # Parse video_ids if provided
    video_id_list: list[str] = []
    if video_ids:
        video_id_list = [v.strip() for v in video_ids.split(',') if v.strip()]

    with get_connection() as conn:
        # Get top commented videos
        where_sql = "c.published_at >= ? AND c.published_at <= ?"
        params: list[object] = [start_date, end_date]
        if content_type:
            where_sql += " AND v.content_type = ?"
            params.append(content_type)
        if video_id_list:
            placeholders = ','.join('?' * len(video_id_list))
            where_sql += f" AND c.video_id IN ({placeholders})"
            params.extend(video_id_list)

        comment_rows = conn.execute(
            f"""
            SELECT
                c.video_id,
                v.title,
                v.thumbnail_url,
                v.published_at,
                COUNT(c.id) AS comment_count
            FROM comments c
            JOIN videos v ON v.id = c.video_id
            WHERE {where_sql}
            GROUP BY c.video_id
            ORDER BY comment_count DESC
            LIMIT 10
            """,
            tuple(params),
        ).fetchall()

        # Get total comment count across all videos
        total_comments_result = conn.execute(
            f"""
            SELECT COUNT(c.id) AS total
            FROM comments c
            JOIN videos v ON v.id = c.video_id
            WHERE {where_sql}
            """,
            tuple(params),
        ).fetchone()
        total_comments = total_comments_result[0] if total_comments_result else 0

        # Get top subscriber-gaining videos
        where_sql = "va.date >= ? AND va.date <= ?"
        params = [start_date, end_date]
        if content_type:
            where_sql += " AND v.content_type = ?"
            params.append(content_type)
        if video_id_list:
            placeholders = ','.join('?' * len(video_id_list))
            where_sql += f" AND va.video_id IN ({placeholders})"
            params.extend(video_id_list)

        subscriber_rows = conn.execute(
            f"""
            SELECT
                va.video_id,
                v.title,
                v.thumbnail_url,
                v.published_at,
                SUM(COALESCE(va.subscribers_gained, 0)) AS subscribers_gained
            FROM video_analytics va
            JOIN videos v ON v.id = va.video_id
            WHERE {where_sql}
            GROUP BY va.video_id
            ORDER BY subscribers_gained DESC
            LIMIT 10
            """,
            tuple(params),
        ).fetchall()

        # Get total subscribers gained across all videos
        total_subscribers_result = conn.execute(
            f"""
            SELECT SUM(COALESCE(va.subscribers_gained, 0)) AS total
            FROM video_analytics va
            JOIN videos v ON v.id = va.video_id
            WHERE {where_sql}
            """,
            tuple(params),
        ).fetchone()
        total_subscribers_gained = int(total_subscribers_result[0]) if total_subscribers_result and total_subscribers_result[0] else 0

    return {
        "total_comments": total_comments,
        "total_subscribers_gained": total_subscribers_gained,
        "top_commented_videos": [row_to_dict(row) for row in comment_rows],
        "top_subscriber_videos": [row_to_dict(row) for row in subscriber_rows],
    }
