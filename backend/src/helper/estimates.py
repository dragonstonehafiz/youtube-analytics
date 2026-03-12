from __future__ import annotations

from dataclasses import dataclass
from datetime import UTC, date, datetime, timedelta
from math import ceil

from src.youtube.analytics import DateRange, chunk_date_range


@dataclass(frozen=True)
class EstimateResult:
    """Estimated minimum API calls plus short rationale."""

    minimum_api_calls: int
    basis: str


def _to_date(value: str | None):
    """Parse a YYYY-MM-DD value into a date object; return None when invalid."""
    if not value:
        return None
    try:
        return datetime.fromisoformat(value).date()
    except ValueError:
        return None


def _month_start(value: str) -> date:
    """Return the first day of the month for a valid YYYY-MM-DD value."""
    parsed = datetime.fromisoformat(value).date()
    return parsed.replace(day=1)


def _next_month(value: str) -> date:
    """Return first day of the month following a valid YYYY-MM-DD value."""
    current = _month_start(value)
    if current.month == 12:
        return current.replace(year=current.year + 1, month=1)
    return current.replace(month=current.month + 1)


def _month_span_inclusive(start_value: date, end_value: date) -> int:
    """Return inclusive month count between two first-of-month dates."""
    return ((end_value.year - start_value.year) * 12) + (end_value.month - start_value.month) + 1


def build_estimate_date_range(
    earliest_date: str | None,
    start_date: str | None,
    end_date: str | None,
) -> tuple[str, str] | None:
    """Resolve selected range using earliest fallback and clamp end to today."""
    if not earliest_date:
        return None
    earliest = _to_date(earliest_date)
    if not earliest:
        return None
    resolved_start = _to_date(start_date) or earliest
    default_end = datetime.now(UTC).date() - timedelta(days=1)
    if default_end < earliest:
        default_end = earliest
    resolved_end = _to_date(end_date) or default_end
    today = datetime.now(UTC).date()
    if resolved_end > today:
        resolved_end = today
    if resolved_start > resolved_end:
        return None
    return resolved_start.isoformat(), resolved_end.isoformat()


def _count_segmented_entity_api_calls(
    entity_ids: list[str],
    published_by_id: dict[str, str],
    latest_by_id: dict[str, str],
    start: str,
    end: str,
    months_per_chunk: int,
    deep_sync: bool,
) -> tuple[int, int, int]:
    """Count per-entity segment calls and return (calls, active_entities, segments)."""
    segments = chunk_date_range(DateRange(start=start, end=end), months_per_chunk=months_per_chunk)
    calls = 0
    active_ids: set[str] = set()
    for segment in segments:
        seg_start = _to_date(segment.start)
        seg_end = _to_date(segment.end)
        if not seg_start or not seg_end:
            continue
        for entity_id in entity_ids:
            published = _to_date(published_by_id.get(entity_id))
            if published and published > seg_end:
                continue
            latest = None if deep_sync else _to_date(latest_by_id.get(entity_id))
            next_start = (latest + timedelta(days=1)) if latest else seg_start
            if next_start > seg_end:
                continue
            calls += 1
            active_ids.add(entity_id)
    return calls, len(active_ids), len(segments)


def _count_video_search_api_calls(
    video_ids: list[str],
    published_by_video: dict[str, str],
    latest_by_video: dict[str, str],
    start: str,
    end: str,
    deep_sync: bool,
) -> tuple[int, int, int]:
    """Count video-search calls and return (calls, active_videos, covered_video_months)."""
    range_start = _to_date(start)
    range_end = _to_date(end)
    if not range_start or not range_end:
        return 0, 0, 0
    calls = 0
    active_videos = 0
    total_months = 0
    for video_id in video_ids:
        effective_start = range_start
        published = _to_date(published_by_video.get(video_id))
        if published and published > range_end:
            continue
        if published and published > effective_start:
            effective_start = published
        latest = None if deep_sync else _to_date(latest_by_video.get(video_id))
        if latest:
            next_month = _next_month(latest.isoformat())
            if next_month > effective_start:
                effective_start = next_month
        if effective_start > range_end:
            continue
        active_videos += 1
        month_count = _month_span_inclusive(_month_start(effective_start.isoformat()), _month_start(range_end.isoformat()))
        total_months += month_count
        calls += month_count
    return calls, active_videos, total_months


def estimate_videos_api_calls(video_count: int, shorts_count: int) -> EstimateResult:
    """Estimate minimum calls for sync_videos."""
    upload_playlist_calls = max(1, ceil(max(video_count, 1) / 50))
    video_detail_calls = max(1, ceil(max(video_count, 1) / 50))
    short_playlist_calls = max(1, ceil(max(shorts_count, 1) / 50))
    return EstimateResult(
        minimum_api_calls=upload_playlist_calls + video_detail_calls + short_playlist_calls,
        basis="uploads playlistItems.list + videos.list + shorts playlistItems.list",
    )


def estimate_playlists_api_calls(playlist_count: int, playlist_item_counts: list[int]) -> EstimateResult:
    """Estimate minimum calls for sync_playlists."""
    playlist_list_calls = max(1, ceil(max(playlist_count, 1) / 50))
    per_playlist_item_calls = 0
    for item_count in playlist_item_counts:
        per_playlist_item_calls += max(1, ceil(max(int(item_count), 1) / 50))
    return EstimateResult(
        minimum_api_calls=playlist_list_calls + per_playlist_item_calls,
        basis="playlists.list + playlistItems.list per playlist (minimum paging)",
    )


def estimate_comments_api_calls(video_count: int) -> EstimateResult:
    """Estimate minimum calls for sync_comments."""
    return EstimateResult(
        minimum_api_calls=max(video_count, 1),
        basis="commentThreads.list per video (minimum one call each, no pagination)",
    )


def estimate_audience_api_calls(public_subscriber_count: int) -> EstimateResult:
    """Estimate minimum calls for sync_audience."""
    return EstimateResult(
        minimum_api_calls=max(1, ceil(max(public_subscriber_count, 1) / 50)),
        basis="subscriptions.list (minimum paging); commenter backfill is DB-only",
    )


def estimate_channel_analytics_api_calls(
    earliest_video_date: str | None,
    latest_channel_analytics_date: str | None,
    start_date: str | None,
    end_date: str | None,
    deep_sync: bool,
) -> EstimateResult:
    """Estimate minimum calls for sync_channel_analytics."""
    resolved = build_estimate_date_range(earliest_video_date, start_date, end_date)
    if not resolved:
        return EstimateResult(minimum_api_calls=0, basis="no videos/date range")
    start, end = resolved
    if not deep_sync and latest_channel_analytics_date:
        latest = _to_date(latest_channel_analytics_date)
        if latest:
            next_date = (latest + timedelta(days=1)).isoformat()
            if next_date > start:
                start = next_date
    if _to_date(start) and _to_date(end) and _to_date(start) > _to_date(end):
        return EstimateResult(minimum_api_calls=0, basis="up to date")
    segments = chunk_date_range(DateRange(start=start, end=end), months_per_chunk=4)
    return EstimateResult(
        minimum_api_calls=len(segments),
        basis=f"1 channel over {len(segments)} segments (1 call per 4-month segment)",
    )


def estimate_traffic_sources_api_calls(
    earliest_video_date: str | None,
    latest_traffic_sources_date: str | None,
    start_date: str | None,
    end_date: str | None,
    deep_sync: bool,
) -> EstimateResult:
    """Estimate minimum calls for sync_traffic_sources (with 7-day chunking for API limit)."""
    resolved = build_estimate_date_range(earliest_video_date, start_date, end_date)
    if not resolved:
        return EstimateResult(minimum_api_calls=0, basis="no videos/date range")
    start, end = resolved
    if not deep_sync and latest_traffic_sources_date:
        latest = _to_date(latest_traffic_sources_date)
        if latest:
            next_date = (latest + timedelta(days=1)).isoformat()
            if next_date > start:
                start = next_date
    if _to_date(start) and _to_date(end) and _to_date(start) > _to_date(end):
        return EstimateResult(minimum_api_calls=0, basis="up to date")
    # Count 7-day chunks (YouTube Analytics API has 200-row limit, ~30 rows/day with multiple sources)
    start_date_obj = _to_date(start)
    end_date_obj = _to_date(end)
    if not start_date_obj or not end_date_obj:
        return EstimateResult(minimum_api_calls=0, basis="invalid date range")
    day_count = (end_date_obj - start_date_obj).days + 1
    week_count = ceil(day_count / 7)
    # Account for pagination (200-row limit) with 1.5x multiplier
    estimated_api_calls = ceil(week_count * 1.5)
    return EstimateResult(
        minimum_api_calls=estimated_api_calls,
        basis=f"~{day_count} days across {week_count} 7-day chunks (×1.5 for pagination, API 200-row limit)",
    )


def estimate_playlist_analytics_api_calls(
    playlist_ids: list[str],
    published_by_playlist: dict[str, str],
    latest_by_playlist: dict[str, str],
    earliest_playlist_date: str | None,
    start_date: str | None,
    end_date: str | None,
    deep_sync: bool,
) -> EstimateResult:
    """Estimate minimum calls for sync_playlist_analytics."""
    resolved = build_estimate_date_range(earliest_playlist_date, start_date, end_date)
    if not resolved:
        return EstimateResult(minimum_api_calls=0, basis="no playlists/date range")
    start, end = resolved
    calls, playlist_count, segment_count = _count_segmented_entity_api_calls(
        entity_ids=playlist_ids,
        published_by_id=published_by_playlist,
        latest_by_id=latest_by_playlist,
        start=start,
        end=end,
        months_per_chunk=4,
        deep_sync=deep_sync,
    )
    return EstimateResult(
        minimum_api_calls=calls,
        basis=f"{playlist_count} playlists over {segment_count} segments (1 call per playlist per 4-month segment)",
    )


def estimate_video_analytics_api_calls(
    video_ids: list[str],
    published_by_video: dict[str, str],
    latest_by_video: dict[str, str],
    earliest_video_date: str | None,
    start_date: str | None,
    end_date: str | None,
    deep_sync: bool,
) -> EstimateResult:
    """Estimate minimum calls for sync_video_analytics."""
    resolved = build_estimate_date_range(earliest_video_date, start_date, end_date)
    if not resolved:
        return EstimateResult(minimum_api_calls=0, basis="no videos/date range")
    start, end = resolved
    calls, video_count, segment_count = _count_segmented_entity_api_calls(
        entity_ids=video_ids,
        published_by_id=published_by_video,
        latest_by_id=latest_by_video,
        start=start,
        end=end,
        months_per_chunk=4,
        deep_sync=deep_sync,
    )
    return EstimateResult(
        minimum_api_calls=calls,
        basis=f"{video_count} videos over {segment_count} segments (1 call per video per 4-month segment)",
    )


def estimate_video_traffic_source_api_calls(
    video_ids: list[str],
    published_by_video: dict[str, str],
    latest_by_video: dict[str, str],
    earliest_video_date: str | None,
    start_date: str | None,
    end_date: str | None,
    deep_sync: bool,
) -> EstimateResult:
    """Estimate minimum calls for sync_video_traffic_source."""
    resolved = build_estimate_date_range(earliest_video_date, start_date, end_date)
    if not resolved:
        return EstimateResult(minimum_api_calls=0, basis="no videos/date range")
    start, end = resolved
    calls, video_count, segment_count = _count_segmented_entity_api_calls(
        entity_ids=video_ids,
        published_by_id=published_by_video,
        latest_by_id=latest_by_video,
        start=start,
        end=end,
        months_per_chunk=4,
        deep_sync=deep_sync,
    )
    return EstimateResult(
        minimum_api_calls=calls,
        basis=f"{video_count} videos over {segment_count} segments (1 call per video per 4-month segment)",
    )


def estimate_video_search_insights_api_calls(
    video_ids: list[str],
    published_by_video: dict[str, str],
    latest_by_video: dict[str, str],
    earliest_video_date: str | None,
    start_date: str | None,
    end_date: str | None,
    deep_sync: bool,
) -> EstimateResult:
    """Estimate minimum calls for sync_video_search_insights."""
    resolved = build_estimate_date_range(earliest_video_date, start_date, end_date)
    if not resolved:
        return EstimateResult(minimum_api_calls=0, basis="no videos/date range")
    start, end = resolved
    calls, video_count, month_count = _count_video_search_api_calls(
        video_ids=video_ids,
        published_by_video=published_by_video,
        latest_by_video=latest_by_video,
        start=start,
        end=end,
        deep_sync=deep_sync,
    )
    return EstimateResult(
        minimum_api_calls=calls,
        basis=(
            f"{video_count} videos across {month_count} video-months "
            "(1 call per video-month, single page only: top 25 terms by views)"
        ),
    )
