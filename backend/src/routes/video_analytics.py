from __future__ import annotations
from datetime import date as date_cls, timedelta
import math

from fastapi import APIRouter, HTTPException, Query
from src.database.db import get_connection, row_to_dict
from src.database.video_search_insights import get_search_term_videos, get_top_search_terms

router = APIRouter()


@router.get("/analytics/video-daily")
def list_video_daily_analytics(
    start_date: str | None = None,
    end_date: str | None = None,
    video_id: str | None = None,
    video_ids: str | None = None,
    limit: int = Query(default=1000, ge=1, le=10000),
) -> dict:
    """Return daily analytics with optional filters. Accepts single video_id or multiple video_ids (CSV)."""
    # Handle multiple video IDs
    if video_ids:
        ids_list = [vid.strip() for vid in video_ids.split(',') if vid.strip()]
        if not ids_list:
            return {"items": []}

        placeholders = ','.join(['?' for _ in ids_list])
        where_clauses = [f"video_id IN ({placeholders})"]
        params: list[object] = ids_list

        if start_date:
            where_clauses.append("date >= ?")
            params.append(start_date)
        if end_date:
            where_clauses.append("date <= ?")
            params.append(end_date)

        where_sql = "WHERE " + " AND ".join(where_clauses)

        query = f"""
            SELECT
                date,
                SUM(COALESCE(engaged_views, 0)) AS engaged_views,
                SUM(COALESCE(views, 0)) AS views,
                SUM(COALESCE(watch_time_minutes, 0)) AS watch_time_minutes,
                SUM(COALESCE(estimated_revenue, 0)) AS estimated_revenue,
                SUM(COALESCE(estimated_ad_revenue, 0)) AS estimated_ad_revenue,
                SUM(COALESCE(gross_revenue, 0)) AS gross_revenue,
                SUM(COALESCE(estimated_red_partner_revenue, 0)) AS estimated_red_partner_revenue,
                AVG(COALESCE(average_view_duration_seconds, 0)) AS average_view_duration_seconds,
                AVG(COALESCE(average_view_percentage, 0)) AS average_view_percentage,
                SUM(COALESCE(likes, 0)) AS likes,
                SUM(COALESCE(comments, 0)) AS comments,
                SUM(COALESCE(shares, 0)) AS shares,
                SUM(COALESCE(monetized_playbacks, 0)) AS monetized_playbacks,
                CASE
                    WHEN SUM(COALESCE(ad_impressions, 0)) > 0
                    THEN SUM(COALESCE(cpm, 0) * COALESCE(ad_impressions, 0)) / SUM(COALESCE(ad_impressions, 0))
                    ELSE AVG(cpm)
                END AS cpm,
                SUM(COALESCE(ad_impressions, 0)) AS ad_impressions,
                SUM(COALESCE(subscribers_gained, 0)) AS subscribers_gained,
                SUM(COALESCE(subscribers_lost, 0)) AS subscribers_lost
            FROM video_analytics
            {where_sql}
            GROUP BY date
            ORDER BY date ASC
        """
    else:
        # Original single video_id logic
        where_clauses = []
        params = []

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
                AVG(a.average_view_duration_seconds) AS average_view_duration_seconds,
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


@router.get("/analytics/video-daily/outliers")
def list_video_daily_outliers(
    start_date: str,
    end_date: str,
    metric: str = Query(default="views"),
    granularity: str = Query(default="daily"),
    video_ids: str = Query(default=""),
    content_type: str | None = None,
) -> dict:
    """Detect spike regions in video analytics using 95th percentile. Filters by video_ids and/or content_type."""
    allowed_metrics = {"views", "watch_time_minutes", "estimated_revenue", "subscribers_gained", "likes", "comments", "engaged_views", "ad_impressions", "monetized_playbacks", "cpm"}
    if metric not in allowed_metrics:
        raise HTTPException(status_code=400, detail=f"Invalid metric. Allowed: {', '.join(sorted(allowed_metrics))}")

    expansion_map = {
        "daily": 2,
        "7d": 14,
        "28d": 28,
        "90d": 90,
        "monthly": 30,
        "yearly": 365,
    }
    expansion_days = expansion_map.get(granularity, 2)

    with get_connection() as conn:
        video_id_list = [vid.strip() for vid in video_ids.split(',') if vid.strip()] if video_ids else []

        if video_id_list:
            placeholders = ','.join(['?' for _ in video_id_list])
            rows = conn.execute(
                f"""
                SELECT
                    va.date AS day,
                    SUM(COALESCE(va.{metric}, 0)) AS value
                FROM video_analytics va
                WHERE va.date >= ? AND va.date <= ? AND va.video_id IN ({placeholders})
                GROUP BY va.date
                ORDER BY va.date ASC
                """,
                (start_date, end_date, *video_id_list),
            ).fetchall()
        elif content_type:
            rows = conn.execute(
                f"""
                SELECT
                    va.date AS day,
                    SUM(COALESCE(va.{metric}, 0)) AS value
                FROM video_analytics va
                JOIN videos v ON v.id = va.video_id
                WHERE va.date >= ? AND va.date <= ? AND v.content_type = ?
                GROUP BY va.date
                ORDER BY va.date ASC
                """,
                (start_date, end_date, content_type),
            ).fetchall()
        else:
            rows = conn.execute(
                f"""
                SELECT
                    va.date AS day,
                    SUM(COALESCE(va.{metric}, 0)) AS value
                FROM video_analytics va
                WHERE va.date >= ? AND va.date <= ?
                GROUP BY va.date
                ORDER BY va.date ASC
                """,
                (start_date, end_date),
            ).fetchall()

    if not rows:
        return {"items": []}

    start_date_obj = date_cls.fromisoformat(start_date)
    end_date_obj = date_cls.fromisoformat(end_date)
    date_range_days = (end_date_obj - start_date_obj).days
    if date_range_days <= 180:
        return {"items": []}

    values = [float(row["value"]) for row in rows]

    if len(values) > 1:
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        stddev = variance ** 0.5
        if mean > 0 and stddev / mean < 0.05:
            return {"items": []}

    sorted_values = sorted(values)
    n = len(sorted_values)
    percentile_95_index = math.ceil(0.95 * n) - 1
    percentile_95 = sorted_values[max(0, percentile_95_index)]
    outlier_days = [{"day": row["day"], "value": float(row["value"])} for row in rows if float(row["value"]) >= percentile_95]
    if not outlier_days:
        return {"items": []}

    regions: list[list[dict]] = []
    current = [outlier_days[0]]
    for i in range(1, len(outlier_days)):
        prev = date_cls.fromisoformat(outlier_days[i - 1]["day"])
        curr = date_cls.fromisoformat(outlier_days[i]["day"])
        if (curr - prev).days <= 3:
            current.append(outlier_days[i])
        else:
            regions.append(current)
            current = [outlier_days[i]]
    regions.append(current)

    expanded_regions = []
    for region in regions:
        start = date_cls.fromisoformat(region[0]["day"]) - timedelta(days=expansion_days)
        end = date_cls.fromisoformat(region[-1]["day"]) + timedelta(days=expansion_days)
        expanded_regions.append({
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
        })

    expanded_regions.sort(key=lambda x: x["start_date"])
    merged = []
    for region in expanded_regions:
        if not merged:
            merged.append(region)
        else:
            last = merged[-1]
            if region["start_date"] <= last["end_date"]:
                last["end_date"] = max(last["end_date"], region["end_date"])
            else:
                merged.append(region)

    return {"items": merged}


@router.get("/analytics/video-daily/top-contributors")
def list_video_daily_top_contributors(
    start_date: str,
    end_date: str,
    metric: str = Query(default="views"),
    video_ids: str = Query(default=""),
) -> dict:
    """Return videos with metric values in the top 5% for the period."""
    allowed_metrics = {"views", "watch_time_minutes", "estimated_revenue", "subscribers_gained", "likes", "comments", "engaged_views", "ad_impressions", "monetized_playbacks", "cpm"}
    if metric not in allowed_metrics:
        raise HTTPException(status_code=400, detail=f"Invalid metric. Allowed: {', '.join(sorted(allowed_metrics))}")

    # Parse video_ids if provided
    video_id_list = [vid.strip() for vid in video_ids.split(',') if vid.strip()] if video_ids else []

    with get_connection() as conn:
        if video_id_list:
            placeholders = ','.join(['?' for _ in video_id_list])
            rows = conn.execute(
                f"""
                SELECT
                    va.video_id,
                    v.title,
                    v.thumbnail_url,
                    v.content_type,
                    v.published_at,
                    SUM(COALESCE(va.{metric}, 0)) AS metric_value
                FROM video_analytics va
                JOIN videos v ON v.id = va.video_id
                WHERE va.date >= ? AND va.date <= ? AND va.video_id IN ({placeholders})
                GROUP BY va.video_id
                ORDER BY metric_value DESC
                """,
                (start_date, end_date, *video_id_list),
            ).fetchall()
        else:
            rows = conn.execute(
                f"""
                SELECT
                    va.video_id,
                    v.title,
                    v.thumbnail_url,
                    v.content_type,
                    v.published_at,
                    SUM(COALESCE(va.{metric}, 0)) AS metric_value
                FROM video_analytics va
                JOIN videos v ON v.id = va.video_id
                WHERE va.date >= ? AND va.date <= ?
                GROUP BY va.video_id
                ORDER BY metric_value DESC
                """,
                (start_date, end_date),
            ).fetchall()

        if not rows:
            return {"items": []}

        metric_values = [float(row["metric_value"]) for row in rows]
        sorted_values = sorted(metric_values)
        n = len(sorted_values)
        percentile_95_index = math.ceil(0.95 * n) - 1
        threshold = sorted_values[max(0, percentile_95_index)]

        result = [row_to_dict(row) for row in rows if float(row["metric_value"]) >= threshold]
        return {"items": result}


@router.get("/analytics/video-traffic-sources")
def list_video_traffic_sources(
    start_date: str,
    end_date: str,
    content_type: str | None = None,
    video_id: str | None = None,
    video_ids: str | None = None,
) -> dict:
    """Return video-level daily traffic-source rows for a range, optionally filtered by content type or video IDs."""
    where_sql = "vts.date >= ? AND vts.date <= ?"
    params: list[object] = [start_date, end_date]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)
    if video_id:
        where_sql += " AND vts.video_id = ?"
        params.append(video_id)
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
    limit: int = Query(default=10, ge=1, le=100),
) -> dict:
    """Return top videos for one traffic source within a date range, optionally filtered by content type."""
    where_sql = "vts.date >= ? AND vts.date <= ? AND vts.traffic_source = ?"
    params: list[object] = [start_date, end_date, traffic_source]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)
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


@router.get("/analytics/video-search-insights")
def list_video_search_insights(
    start_date: str,
    end_date: str,
    video_ids: str | None = None,
    content_type: str | None = None,
) -> dict:
    """Return top search terms by views from monthly search insights rows."""
    parsed_video_ids = (
        [value.strip() for value in video_ids.split(",") if value and value.strip()]
        if video_ids
        else []
    )
    items = get_top_search_terms(
        start_date=start_date,
        end_date=end_date,
        video_ids=parsed_video_ids if parsed_video_ids else None,
        content_type=content_type,
    )
    return {"items": items}


@router.get("/analytics/video-search-insights/videos")
def list_video_search_insight_videos(
    start_date: str,
    end_date: str,
    search_term: str,
    content_type: str | None = None,
    video_ids: str | None = None,
) -> dict:
    """Return videos for one search term sorted by search-driven views."""
    parsed_video_ids = (
        [value.strip() for value in video_ids.split(",") if value and value.strip()]
        if video_ids
        else []
    )
    items = get_search_term_videos(
        start_date=start_date,
        end_date=end_date,
        search_term=search_term,
        content_type=content_type,
        video_ids=parsed_video_ids if parsed_video_ids else None,
    )
    return {"items": items}


@router.get("/analytics/top-content")
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


@router.get("/analytics/content-insights")
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


@router.get("/analytics/engagement-insights")
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
