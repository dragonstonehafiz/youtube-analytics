"""Outlier detection and batch top-contributors endpoints."""

from __future__ import annotations
from datetime import date as date_cls, timedelta
import math

from fastapi import APIRouter, HTTPException, Query
from pydantic import BaseModel
from src.database.db import get_connection, row_to_dict

router = APIRouter()


# Pydantic models for batch requests
class Region(BaseModel):
    """A date range region."""
    start_date: str
    end_date: str


class TopContributorsByVideoIdsRequest(BaseModel):
    """Request body for batch top-contributors by video IDs."""
    regions: list[Region]
    metric: str = "views"
    video_ids: list[str] = []


class TopContributorsByContentTypeRequest(BaseModel):
    """Request body for batch top-contributors by content type."""
    regions: list[Region]
    metric: str = "views"
    content_type: str | None = None


@router.get("/outliers/channel")
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


@router.get("/outliers/video")
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


@router.post("/outliers/video/top-contributors/video-ids")
def batch_video_top_contributors_by_video_ids(
    request: TopContributorsByVideoIdsRequest,
) -> dict:
    """Return top-contributors (top 5% by metric) for each region, optionally filtered by video IDs."""
    allowed_metrics = {"views", "watch_time_minutes", "estimated_revenue", "subscribers_gained", "likes", "comments", "engaged_views", "ad_impressions", "monetized_playbacks", "cpm"}
    if request.metric not in allowed_metrics:
        raise HTTPException(status_code=400, detail=f"Invalid metric. Allowed: {', '.join(sorted(allowed_metrics))}")

    result_items = []

    for region in request.regions:
        start_date = region.start_date
        end_date = region.end_date

        with get_connection() as conn:
            if request.video_ids:
                placeholders = ','.join(['?' for _ in request.video_ids])
                rows = conn.execute(
                    f"""
                    SELECT
                        va.video_id,
                        v.title,
                        v.thumbnail_url,
                        v.content_type,
                        v.published_at,
                        SUM(COALESCE(va.{request.metric}, 0)) AS metric_value
                    FROM video_analytics va
                    JOIN videos v ON v.id = va.video_id
                    WHERE va.date >= ? AND va.date <= ? AND va.video_id IN ({placeholders})
                    GROUP BY va.video_id
                    ORDER BY metric_value DESC
                    """,
                    (start_date, end_date, *request.video_ids),
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
                        SUM(COALESCE(va.{request.metric}, 0)) AS metric_value
                    FROM video_analytics va
                    JOIN videos v ON v.id = va.video_id
                    WHERE va.date >= ? AND va.date <= ?
                    GROUP BY va.video_id
                    ORDER BY metric_value DESC
                    """,
                    (start_date, end_date),
                ).fetchall()

            contributors = []
            if rows:
                metric_values = [float(row["metric_value"]) for row in rows]
                sorted_values = sorted(metric_values)
                n = len(sorted_values)
                percentile_95_index = math.ceil(0.95 * n) - 1
                threshold = sorted_values[max(0, percentile_95_index)]
                contributors = [row_to_dict(row) for row in rows if float(row["metric_value"]) >= threshold]

            result_items.append({
                "start_date": start_date,
                "end_date": end_date,
                "contributors": contributors,
            })

    return {"items": result_items}


@router.post("/outliers/video/top-contributors/content-type")
def batch_video_top_contributors_by_content_type(
    request: TopContributorsByContentTypeRequest,
) -> dict:
    """Return top-contributors (top 5% by metric) for each region, optionally filtered by content type."""
    allowed_metrics = {"views", "watch_time_minutes", "estimated_revenue", "subscribers_gained", "likes", "comments", "engaged_views", "ad_impressions", "monetized_playbacks", "cpm"}
    if request.metric not in allowed_metrics:
        raise HTTPException(status_code=400, detail=f"Invalid metric. Allowed: {', '.join(sorted(allowed_metrics))}")

    result_items = []

    for region in request.regions:
        start_date = region.start_date
        end_date = region.end_date

        with get_connection() as conn:
            if request.content_type:
                rows = conn.execute(
                    f"""
                    SELECT
                        va.video_id,
                        v.title,
                        v.thumbnail_url,
                        v.content_type,
                        v.published_at,
                        SUM(COALESCE(va.{request.metric}, 0)) AS metric_value
                    FROM video_analytics va
                    JOIN videos v ON v.id = va.video_id
                    WHERE va.date >= ? AND va.date <= ? AND v.content_type = ?
                    GROUP BY va.video_id
                    ORDER BY metric_value DESC
                    """,
                    (start_date, end_date, request.content_type),
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
                        SUM(COALESCE(va.{request.metric}, 0)) AS metric_value
                    FROM video_analytics va
                    JOIN videos v ON v.id = va.video_id
                    WHERE va.date >= ? AND va.date <= ?
                    GROUP BY va.video_id
                    ORDER BY metric_value DESC
                    """,
                    (start_date, end_date),
                ).fetchall()

            contributors = []
            if rows:
                metric_values = [float(row["metric_value"]) for row in rows]
                sorted_values = sorted(metric_values)
                n = len(sorted_values)
                percentile_95_index = math.ceil(0.95 * n) - 1
                threshold = sorted_values[max(0, percentile_95_index)]
                contributors = [row_to_dict(row) for row in rows if float(row["metric_value"]) >= threshold]

            result_items.append({
                "start_date": start_date,
                "end_date": end_date,
                "contributors": contributors,
            })

    return {"items": result_items}
