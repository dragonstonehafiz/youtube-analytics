from __future__ import annotations

import calendar
import time
from dataclasses import dataclass
from datetime import date, timedelta
from typing import Any

from googleapiclient.errors import HttpError

from src.youtube.client import get_analytics_client


@dataclass(frozen=True)
class DateRange:
    start: str
    end: str


METRICS = [
    "views",
    "estimatedMinutesWatched",
    "estimatedRevenue",
    "averageViewDuration",
    "likes",
    "comments",
    "shares",
    "subscribersGained",
    "subscribersLost",
]


def add_months(base_date: date, months: int) -> date:
    """Return a date shifted by the given number of months."""
    month = base_date.month - 1 + months
    year = base_date.year + month // 12
    month = month % 12 + 1
    day = min(base_date.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def chunk_date_range(date_range: DateRange, months_per_chunk: int = 4) -> list[DateRange]:
    """Split a date range into month-sized segments."""
    start = date.fromisoformat(date_range.start)
    end = date.fromisoformat(date_range.end)
    segments: list[DateRange] = []
    current = start
    while current <= end:
        next_start = add_months(current, months_per_chunk)
        segment_end = min(next_start - timedelta(days=1), end)
        segments.append(DateRange(current.isoformat(), segment_end.isoformat()))
        current = segment_end + timedelta(days=1)
    return segments


def determine_date_range(earliest_upload: str) -> DateRange:
    """Compute full-history date range from earliest upload through yesterday."""
    # Pull full history from earliest upload through yesterday.
    start = date.fromisoformat(earliest_upload)
    end = date.today() - timedelta(days=1)
    if end < start:
        end = start
    return DateRange(start=start.isoformat(), end=end.isoformat())


def fetch_daily_metrics(
    video_id: str,
    start_date: str,
    end_date: str,
    publish_date: str | None = None,
    max_results: int = 200,
) -> list[dict[str, Any]]:
    """Fetch daily analytics rows for one video across a date range."""
    yt_analytics = get_analytics_client()
    # Avoid requesting analytics before the video was published.
    effective_start = start_date
    if publish_date:
        if publish_date > end_date:
            return []
        if publish_date > start_date:
            effective_start = publish_date

    # Request daily analytics per video; page with startIndex/maxResults.
    request_params = {
        "ids": "channel==MINE",
        "startDate": effective_start,
        "endDate": end_date,
        "metrics": ",".join(METRICS),
        "dimensions": "day",
        "filters": f"video=={video_id}",
        "maxResults": max_results,
        "startIndex": 1,
    }

    return _fetch_report_rows(yt_analytics, request_params, max_results)


def fetch_channel_daily(start_date: str, end_date: str) -> list[dict[str, Any]]:
    """Fetch channel-level daily analytics for a date range."""
    yt_analytics = get_analytics_client()
    request_params = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": (
            "views,estimatedMinutesWatched,estimatedRevenue,averageViewDuration,"
            "subscribersGained,subscribersLost"
        ),
        "dimensions": "day",
        "maxResults": 200,
        "startIndex": 1,
    }
    return _fetch_report_rows(yt_analytics, request_params, 200)


def fetch_traffic_sources(start_date: str, end_date: str) -> list[dict[str, Any]]:
    """Fetch traffic sources by day for a date range."""
    yt_analytics = get_analytics_client()
    request_params = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "views,estimatedMinutesWatched",
        "dimensions": "day,insightTrafficSourceType",
        "maxResults": 200,
        "startIndex": 1,
    }
    return _fetch_report_rows(yt_analytics, request_params, 200)


def _execute_with_retry(service, params: dict, max_attempts: int = 5):
    """Execute a YouTube Analytics request with retry logic."""
    for attempt in range(1, max_attempts + 1):
        try:
            return service.reports().query(**params).execute()
        except HttpError as error:
            status = getattr(error, "resp", None)
            status_code: int | None = None
            if status is not None:
                try:
                    status_code = int(getattr(status, "status", None))
                except (TypeError, ValueError):
                    status_code = None
            error_text = ""
            try:
                if error.content:
                    error_text = error.content.decode("utf-8")
            except Exception:
                error_text = str(error)
            if not error_text:
                error_text = str(error)
            is_rate_limit = any(token in error_text for token in ("rateLimitExceeded", "quotaExceeded"))
            # Retry transient server errors and rate-limit responses.
            should_retry = False
            if status_code is not None:
                if status_code >= 500:
                    should_retry = True
                elif status_code in {403, 429} and is_rate_limit:
                    should_retry = True
            if should_retry and attempt < max_attempts:
                sleep_seconds = min(2 ** (attempt - 1), 30)
                time.sleep(sleep_seconds)
                continue
            raise RuntimeError(f"YouTube Analytics API error: {error}") from error


def _fetch_report_rows(service, request_params: dict, max_results: int) -> list[dict[str, Any]]:
    """Fetch all rows for a report, handling pagination."""
    results: list[dict[str, Any]] = []
    headers: list[str] | None = None
    while True:
        response = _execute_with_retry(service, request_params)
        if response is None:
            break
        rows = response.get("rows", []) or []
        if headers is None:
            headers = [h["name"] for h in response.get("columnHeaders", [])]
        for row in rows:
            results.append({headers[i]: row[i] for i in range(len(headers))})
        if len(rows) < max_results:
            break
        request_params["startIndex"] += max_results
        time.sleep(0.2)
    return results
