"""Analytics API endpoints."""

from __future__ import annotations
from datetime import date as date_cls, timedelta
import math

from fastapi import APIRouter, HTTPException, Query
from src.database.db import get_connection, row_to_dict

router = APIRouter()


# Channel analytics routes
@router.get("/analytics/channel")
def list_channel(
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
        "subscribers_gained": sum(item.get("subscribers_gained") or 0 for item in items),
        "subscribers_lost": sum(item.get("subscribers_lost") or 0 for item in items),
    }
    return {"items": items, "totals": totals}


@router.get("/analytics/channel/outliers")
def list_channel_outliers(
    start_date: str,
    end_date: str,
    metric: str = Query(default="views"),
    granularity: str = Query(default="daily"),
) -> dict:
    """Detect spike regions in channel daily analytics using 95th percentile. Channel-level data only."""
    allowed_metrics = {"views", "watch_time_minutes", "estimated_revenue", "subscribers_gained", "likes", "comments", "engaged_views", "ad_impressions", "monetized_playbacks", "cpm"}
    if metric not in allowed_metrics:
        raise HTTPException(status_code=400, detail=f"Invalid metric. Allowed: {', '.join(sorted(allowed_metrics))}")

    # Determine expansion days based on granularity
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
        rows = conn.execute(
            f"SELECT date AS day, COALESCE({metric}, 0) AS value FROM channel_analytics WHERE date >= ? AND date <= ? ORDER BY date ASC",
            (start_date, end_date),
        ).fetchall()
    if not rows:
        return {"items": []}

    # Check if date range is too small (less than 6 months)
    start_date_obj = date_cls.fromisoformat(start_date)
    end_date_obj = date_cls.fromisoformat(end_date)
    date_range_days = (end_date_obj - start_date_obj).days
    if date_range_days <= 180:  # 180 days ~ 6 months
        return {"items": []}

    values = [float(row["value"]) for row in rows]

    # Check if standard deviation is too low
    if len(values) > 1:
        mean = sum(values) / len(values)
        variance = sum((v - mean) ** 2 for v in values) / len(values)
        stddev = variance ** 0.5
        # If stddev is less than 5% of mean, data has very low variation
        if mean > 0 and stddev / mean < 0.05:
            return {"items": []}

    sorted_values = sorted(values)
    n = len(sorted_values)
    percentile_95_index = math.ceil(0.95 * n) - 1
    percentile_95 = sorted_values[max(0, percentile_95_index)]
    outlier_days = [{"day": row["day"], "value": float(row["value"])} for row in rows if float(row["value"]) >= percentile_95]
    if not outlier_days:
        return {"items": []}

    # Group consecutive outlier days
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

    # Expand each region and merge overlapping ones
    expanded_regions = []
    for region in regions:
        start = date_cls.fromisoformat(region[0]["day"]) - timedelta(days=expansion_days)
        end = date_cls.fromisoformat(region[-1]["day"]) + timedelta(days=expansion_days)
        expanded_regions.append({
            "start_date": start.isoformat(),
            "end_date": end.isoformat(),
        })

    # Sort and merge overlapping regions
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


# Video analytics routes
@router.get("/analytics/video")
def list_video(
    start_date: str | None = None,
    end_date: str | None = None,
    video_ids: str | None = None,
    limit: int = Query(default=1000, ge=1, le=10000),
) -> dict:
    """Return daily analytics grouped by date. Accepts video_ids as CSV."""
    ids_list = [vid.strip() for vid in video_ids.split(',') if vid.strip()] if video_ids else []
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

    with get_connection() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    return {"items": [row_to_dict(row) for row in rows]}


@router.get("/analytics/video/aggregate")
def list_video_aggregate(start_date: str, end_date: str, content_type: str | None = None) -> dict:
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


@router.get("/analytics/video/outliers")
def list_video_outliers(
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


@router.get("/analytics/video/top-contributors")
def list_video_top_contributors(
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


# Playlist analytics routes
@router.get("/analytics/playlist/{playlist_id}")
def list_playlist(playlist_id: str, start_date: str, end_date: str) -> dict:
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


@router.get("/analytics/playlist/{playlist_id}/videos")
def list_playlist_videos(playlist_id: str, start_date: str, end_date: str) -> dict:
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
                SUM(COALESCE(a.ad_impressions, 0)) AS ad_impressions,
                SUM(COALESCE(a.monetized_playbacks, 0)) AS monetized_playbacks,
                CASE
                    WHEN SUM(COALESCE(a.ad_impressions, 0)) > 0
                    THEN SUM(COALESCE(a.cpm, 0) * COALESCE(a.ad_impressions, 0)) / SUM(COALESCE(a.ad_impressions, 0))
                    ELSE AVG(a.cpm)
                END AS cpm,
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
    return {"items": items, "totals": totals}
