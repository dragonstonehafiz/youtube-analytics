from __future__ import annotations
from datetime import date as date_cls, timedelta
import math

from fastapi import APIRouter, HTTPException, Query
from src.database.db import get_connection, row_to_dict

router = APIRouter()


@router.get("/analytics/channel-card-summary")
def get_channel_card_summary(
    current_start: str,
    current_end: str,
    previous_start: str,
    previous_end: str,
) -> dict:
    """Return all data needed by the channel analytics dashboard card in a single query."""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN views ELSE 0 END), 0)               AS current_views,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN watch_time_minutes ELSE 0 END), 0)  AS current_watch_time_minutes,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN estimated_revenue ELSE 0 END), 0)   AS current_estimated_revenue,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN subscribers_gained ELSE 0 END), 0)  AS current_subscribers_gained,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN subscribers_lost ELSE 0 END), 0)    AS current_subscribers_lost,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN views ELSE 0 END), 0)               AS previous_views,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN watch_time_minutes ELSE 0 END), 0)  AS previous_watch_time_minutes,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN estimated_revenue ELSE 0 END), 0)   AS previous_estimated_revenue,
                COALESCE(SUM(subscribers_gained), 0) - COALESCE(SUM(subscribers_lost), 0)              AS subscribers_net
            FROM channel_analytics
            WHERE date <= ?
            """,
            (
                current_start, current_end,
                current_start, current_end,
                current_start, current_end,
                current_start, current_end,
                current_start, current_end,
                previous_start, previous_end,
                previous_start, previous_end,
                previous_start, previous_end,
                current_end,
            ),
        ).fetchone()
    r = dict(row) if row else {}
    return {
        "subscribers_net": r.get("subscribers_net", 0),
        "current": {
            "views": r.get("current_views", 0),
            "watch_time_minutes": r.get("current_watch_time_minutes", 0),
            "estimated_revenue": r.get("current_estimated_revenue", 0),
            "subscribers_gained": r.get("current_subscribers_gained", 0),
            "subscribers_lost": r.get("current_subscribers_lost", 0),
        },
        "previous": {
            "views": r.get("previous_views", 0),
            "watch_time_minutes": r.get("previous_watch_time_minutes", 0),
            "estimated_revenue": r.get("previous_estimated_revenue", 0),
        },
    }


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


@router.get("/analytics/channel-daily/outliers")
def list_channel_daily_outliers(
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


@router.get("/analytics/traffic-sources")
def list_channel_traffic_sources(start_date: str, end_date: str) -> dict:
    """Return channel-level daily traffic-source rows for a range."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                date AS day,
                traffic_source,
                views,
                watch_time_minutes
            FROM traffic_sources_daily
            WHERE date >= ? AND date <= ?
            ORDER BY date ASC, traffic_source ASC
            """,
            (start_date, end_date),
        ).fetchall()
    items = [row_to_dict(row) for row in rows]
    return {"items": items}
