from __future__ import annotations

import traceback
from datetime import datetime

from utils.logger import get_logger
from src.helper.sync_dates import (
    build_sync_date_range,
    get_earliest_date,
    find_next_sync_date,
    get_latest_date,
    get_latest_grouped_dates,
    next_day,
    normalize_iso_datetime_to_date,
)
from src.helper.sync_progress import SyncProgress, SyncStopRequested
from src.database.analytics import upsert_daily_analytics
from src.database.audience import upsert_audience, upsert_commenters_from_comments
from src.database.channel_daily import upsert_channel_daily
from src.database.comments import upsert_comments
from src.database.db import get_connection
from src.database.playlist_daily import upsert_playlist_daily_analytics
from src.database.playlists import delete_playlists_not_in, replace_playlist_items, upsert_playlists
from src.database.traffic_sources import upsert_traffic_sources
from src.database.video_search_insights import upsert_video_search_insights
from src.database.video_traffic_source import upsert_video_traffic_source
from src.database.videos import upsert_videos
from src.youtube.analytics import (
    DateRange,
    chunk_date_range,
    fetch_channel_analytics,
    fetch_playlist_daily_metrics,
    fetch_video_search_insight_metrics,
    fetch_video_daily_metrics,
    fetch_video_traffic_source_metrics,
    fetch_traffic_sources,
)
from src.youtube.comments import extract_comments
from src.youtube.playlists import get_all_playlist_items, get_all_playlists
from src.youtube.subscribers import extract_public_subscribers
from src.youtube.videos import safe_get_videos
from src.youtube.videos import get_short_video_ids

sync_progress = SyncProgress()
_logger = get_logger("sync", filename="sync.log", console=False)


def sync_videos() -> None:
    """Sync all video metadata into the database."""
    sync_progress.set_total(1)
    sync_progress.set_current(0)
    sync_progress.set_message(sync_progress.format_message("Pulling videos... [{current}/{total}]"))
    _logger.info("Starting videos sync")
    videos = safe_get_videos()
    short_video_ids = get_short_video_ids()
    upsert_videos(videos, short_video_ids=short_video_ids)
    sync_progress.set_current(1)
    sync_progress.set_message(sync_progress.format_message("Pulling videos... [{current}/{total}]"))
    return None


def list_video_ids() -> list[str]:
    """Return all video IDs from the videos table."""
    with get_connection() as conn:
        rows = conn.execute("SELECT id FROM videos").fetchall()
    return [row["id"] for row in rows]


def list_playlist_ids() -> list[str]:
    """Return all playlist IDs from the playlists table."""
    with get_connection() as conn:
        rows = conn.execute("SELECT id FROM playlists").fetchall()
    return [row["id"] for row in rows]


def build_video_publish_map() -> dict[str, str]:
    """Return a mapping of video_id to publish date (YYYY-MM-DD)."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, published_at FROM videos WHERE published_at IS NOT NULL"
        ).fetchall()
    publish_map: dict[str, str] = {}
    for row in rows:
        # Normalize published_at to YYYY-MM-DD for analytics comparisons.
        published_at = str(row["published_at"])
        publish_map[row["id"]] = normalize_iso_datetime_to_date(published_at)
    return publish_map


def build_playlist_publish_map() -> dict[str, str]:
    """Return a mapping of playlist_id to publish date (YYYY-MM-DD)."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT id, published_at FROM playlists WHERE published_at IS NOT NULL"
        ).fetchall()
    publish_map: dict[str, str] = {}
    for row in rows:
        published_at = str(row["published_at"])
        publish_map[row["id"]] = normalize_iso_datetime_to_date(published_at)
    return publish_map


def sync_video_analytics(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
    segments: list[DateRange] | None = None,
) -> None:
    """Sync video-level daily analytics rows into the database."""
    video_ids = list_video_ids()
    if not video_ids:
        sync_videos()
        video_ids = list_video_ids()
    earliest = get_earliest_date("videos", "published_at", is_timestamp=True)
    if not earliest:
        return None

    date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
    if date_range is None:
        return None

    latest_by_video = {} if deep_sync else get_latest_grouped_dates("video_analytics", "video_id")
    if segments is None:
        segments = chunk_date_range(date_range)
    _logger.info(
        "Starting video analytics sync for %s -> %s (%s segments)",
        date_range.start,
        date_range.end,
        len(segments),
    )
    publish_map = build_video_publish_map()
    total_rows = 0
    segment_video_sets: list[list[str]] = []
    total_videos = 0
    for segment in segments:
        segment_videos: list[str] = []
        for video_id in video_ids:
            publish_date = publish_map.get(video_id)
            if publish_date and publish_date > segment.end:
                continue
            next_start = find_next_sync_date(latest_by_video.get(video_id), segment.start)
            if next_start > segment.end:
                continue
            segment_videos.append(video_id)
        segment_video_sets.append(segment_videos)
        total_videos += len(segment_videos)
    if total_videos == 0:
        sync_progress.set_total(1)
        sync_progress.set_current(0)
        sync_progress.set_message(sync_progress.format_message("Video analytics [{current}/{total}] no videos to sync"))
        return None
    sync_progress.set_total(total_videos)
    sync_progress.set_current(0)
    sync_progress.set_message(sync_progress.format_message("Video analytics [{current}/{total}] starting"))
    for segment_index, segment in enumerate(segments, start=1):
        _logger.info(
            "Video analytics segment %s/%s: %s -> %s",
            segment_index,
            len(segments),
            segment.start,
            segment.end,
        )
        segment_videos = segment_video_sets[segment_index - 1]
        segment_total = max(len(segment_videos), 1)
        for video_index, video_id in enumerate(segment_videos, start=1):
            sync_progress.raise_if_stop_requested("Stop requested. Ending after current API call.")
            sync_progress.increment()
            sync_progress.set_message(
                sync_progress.format_message(
                    "Video analytics [{current}/{total}] {detail}",
                    detail=f"{segment.start} -> {segment.end} Video [{video_index}/{segment_total}]",
                ),
            )
            publish_date = publish_map.get(video_id)
            next_start = find_next_sync_date(latest_by_video.get(video_id), segment.start)
            if next_start > segment.end:
                continue
            rows = fetch_video_daily_metrics(
                video_id,
                next_start,
                segment.end,
                publish_date=publish_date,
            )
            total_rows += upsert_daily_analytics(video_id, rows)
            latest_by_video[video_id] = segment.end

    return None


def sync_video_traffic_source(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
    segments: list[DateRange] | None = None,
) -> None:
    """Sync per-video daily traffic-source rows."""
    video_ids = list_video_ids()
    if not video_ids:
        sync_videos()
        video_ids = list_video_ids()
    earliest = get_earliest_date("videos", "published_at", is_timestamp=True)
    if not earliest:
        return None

    date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
    if date_range is None:
        return None

    latest_traffic_by_video = {} if deep_sync else get_latest_grouped_dates("video_traffic_source", "video_id")
    if segments is None:
        segments = chunk_date_range(date_range)
    _logger.info(
        "Starting video traffic-source sync for %s -> %s (%s segments)",
        date_range.start,
        date_range.end,
        len(segments),
    )
    publish_map = build_video_publish_map()
    total_rows = 0
    segment_video_sets: list[list[str]] = []
    total_videos = 0
    for segment in segments:
        segment_videos: list[str] = []
        for video_id in video_ids:
            publish_date = publish_map.get(video_id)
            if publish_date and publish_date > segment.end:
                continue
            traffic_start = find_next_sync_date(latest_traffic_by_video.get(video_id), segment.start)
            if traffic_start > segment.end:
                continue
            segment_videos.append(video_id)
        segment_video_sets.append(segment_videos)
        total_videos += len(segment_videos)
    if total_videos == 0:
        sync_progress.set_total(1)
        sync_progress.set_current(0)
        sync_progress.set_message(sync_progress.format_message("Video traffic source [{current}/{total}] no videos to sync"))
        return None
    sync_progress.set_total(total_videos)
    sync_progress.set_current(0)
    sync_progress.set_message(sync_progress.format_message("Video traffic source [{current}/{total}] starting"))
    for segment_index, segment in enumerate(segments, start=1):
        _logger.info(
            "Video traffic-source segment %s/%s: %s -> %s",
            segment_index,
            len(segments),
            segment.start,
            segment.end,
        )
        segment_videos = segment_video_sets[segment_index - 1]
        segment_total = max(len(segment_videos), 1)
        for video_index, video_id in enumerate(segment_videos, start=1):
            sync_progress.raise_if_stop_requested("Stop requested. Ending after current API call.")
            sync_progress.increment()
            sync_progress.set_message(
                sync_progress.format_message(
                    "Video traffic source [{current}/{total}] {detail}",
                    detail=f"{segment.start} -> {segment.end} Video [{video_index}/{segment_total}]",
                ),
            )
            publish_date = publish_map.get(video_id)
            traffic_start = find_next_sync_date(latest_traffic_by_video.get(video_id), segment.start)
            if traffic_start <= segment.end:
                traffic_rows = fetch_video_traffic_source_metrics(
                    video_id,
                    traffic_start,
                    segment.end,
                    publish_date=publish_date,
                )
                total_rows += upsert_video_traffic_source(video_id, traffic_rows)
                latest_traffic_by_video[video_id] = segment.end

    return None


def sync_video_search_insights(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
    segments: list[DateRange] | None = None,
) -> None:
    """Sync per-video daily YouTube-search term insight rows."""
    video_ids = list_video_ids()
    if not video_ids:
        sync_videos()
        video_ids = list_video_ids()
    earliest = get_earliest_date("videos", "published_at", is_timestamp=True)
    if not earliest:
        return None

    date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
    if date_range is None:
        return None

    latest_search_by_video = {} if deep_sync else get_latest_grouped_dates("video_search_insights", "video_id")
    if segments is None:
        segments = chunk_date_range(date_range)
    _logger.info(
        "Starting video search-insights sync for %s -> %s (%s segments)",
        date_range.start,
        date_range.end,
        len(segments),
    )
    publish_map = build_video_publish_map()
    total_rows = 0
    segment_video_sets: list[list[str]] = []
    total_videos = 0
    for segment in segments:
        segment_videos: list[str] = []
        for video_id in video_ids:
            publish_date = publish_map.get(video_id)
            if publish_date and publish_date > segment.end:
                continue
            search_start = find_next_sync_date(latest_search_by_video.get(video_id), segment.start)
            if search_start > segment.end:
                continue
            segment_videos.append(video_id)
        segment_video_sets.append(segment_videos)
        total_videos += len(segment_videos)
    if total_videos == 0:
        sync_progress.set_total(1)
        sync_progress.set_current(0)
        sync_progress.set_message(sync_progress.format_message("Video search insights [{current}/{total}] no videos to sync"))
        return None
    sync_progress.set_total(total_videos)
    sync_progress.set_current(0)
    sync_progress.set_message(sync_progress.format_message("Video search insights [{current}/{total}] starting"))

    for segment_index, segment in enumerate(segments, start=1):
        _logger.info(
            "Video search-insights segment %s/%s: %s -> %s",
            segment_index,
            len(segments),
            segment.start,
            segment.end,
        )
        segment_videos = segment_video_sets[segment_index - 1]
        segment_total = max(len(segment_videos), 1)
        for video_index, video_id in enumerate(segment_videos, start=1):
            sync_progress.raise_if_stop_requested("Stop requested. Ending after current API call.")
            sync_progress.increment()
            sync_progress.set_message(
                sync_progress.format_message(
                    "Video search insights [{current}/{total}] {detail}",
                    detail=f"{segment.start} -> {segment.end} Video [{video_index}/{segment_total}]",
                ),
            )
            publish_date = publish_map.get(video_id)
            search_start = find_next_sync_date(latest_search_by_video.get(video_id), segment.start)
            if search_start <= segment.end:
                search_rows = fetch_video_search_insight_metrics(
                    video_id,
                    search_start,
                    segment.end,
                    publish_date=publish_date,
                )
                total_rows += upsert_video_search_insights(video_id, search_rows)
                latest_search_by_video[video_id] = segment.end

    return None


def sync_channel_analytics(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> None:
    """Sync channel-level analytics rows."""
    earliest = get_earliest_date("videos", "published_at", is_timestamp=True)
    if not earliest:
        return None
    date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
    if date_range is None:
        return None
    latest = None if deep_sync else get_latest_date("channel_analytics")
    if latest:
        next_date = next_day(latest)
        if next_date > date_range.start:
            date_range = DateRange(start=next_date, end=date_range.end)
    if date_range.start > date_range.end:
        return None
    segments = chunk_date_range(date_range, months_per_chunk=4)
    _logger.info(
        "Starting channel analytics sync for %s -> %s (%s segments)",
        date_range.start,
        date_range.end,
        len(segments),
    )
    sync_progress.set_total(max(len(segments), 1))
    sync_progress.set_current(0)
    total_rows = 0
    for index, segment in enumerate(segments, start=1):
        sync_progress.raise_if_stop_requested("Stop requested. Ending after current API call.")
        sync_progress.increment()
        sync_progress.set_message(sync_progress.format_message("Pulling channel analytics... [{current}/{total}]"))
        _logger.info(
            "Channel analytics segment %s/%s: %s -> %s",
            index,
            len(segments),
            segment.start,
            segment.end,
        )
        rows = fetch_channel_analytics(segment.start, segment.end)
        total_rows += upsert_channel_daily(rows)
    return None


def sync_traffic_sources(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> None:
    """Sync traffic source analytics rows."""
    earliest = get_earliest_date("videos", "published_at", is_timestamp=True)
    if not earliest:
        return None
    date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
    if date_range is None:
        return None
    latest = None if deep_sync else get_latest_date("traffic_sources_daily")
    if latest:
        next_date = next_day(latest)
        if next_date > date_range.start:
            date_range = DateRange(start=next_date, end=date_range.end)
    if date_range.start > date_range.end:
        return None
    segments = chunk_date_range(date_range, months_per_chunk=12)
    _logger.info(
        "Starting traffic sources sync for %s -> %s (%s segments)",
        date_range.start,
        date_range.end,
        len(segments),
    )
    sync_progress.set_total(max(len(segments), 1))
    sync_progress.set_current(0)
    total_rows = 0
    for index, segment in enumerate(segments, start=1):
        sync_progress.raise_if_stop_requested("Stop requested. Ending after current API call.")
        sync_progress.increment()
        sync_progress.set_message(sync_progress.format_message("Pulling traffic sources... [{current}/{total}]"))
        _logger.info(
            "Traffic sources segment %s/%s: %s -> %s",
            index,
            len(segments),
            segment.start,
            segment.end,
        )
        rows = fetch_traffic_sources(segment.start, segment.end)
        total_rows += upsert_traffic_sources(rows)
    return None








def sync_comments() -> None:
    """Sync all comments for all videos."""
    _logger.info("Starting comments sync")
    video_ids = list_video_ids()
    if not video_ids:
        sync_videos()
        video_ids = list_video_ids()
    total_videos = max(len(video_ids), 1)
    sync_progress.set_total(total_videos)
    sync_progress.set_current(0)
    sync_progress.set_message(sync_progress.format_message("Pulling comments... [{current}/{total}]"))
    total = 0
    for index, video_id in enumerate(video_ids, start=1):
        sync_progress.raise_if_stop_requested("Stop requested. Ending after current API call.")
        _logger.info("Comments video %s/%s", index, len(video_ids))
        rows = extract_comments(video_id)
        sync_progress.increment()
        sync_progress.set_message(sync_progress.format_message("Pulling comments... [{current}/{total}]"))
        total += upsert_comments(rows)


def sync_audience() -> None:
    """Sync public subscribers, then backfill commenter-only audience from comments DB."""
    _logger.info("Starting audience sync")
    subscriber_rows = extract_public_subscribers()
    upsert_audience(subscriber_rows)
    upsert_commenters_from_comments()


def sync_playlists() -> None:
    """Sync playlists and playlist items, tracking progress per playlist."""
    _logger.info("Starting playlists sync")
    playlists = [playlist for playlist in get_all_playlists() if playlist.get("id")]
    upsert_playlists(playlists)
    delete_playlists_not_in([str(playlist["id"]) for playlist in playlists if playlist.get("id")])
    total_playlists = max(len(playlists), 1)
    sync_progress.set_total(total_playlists)
    sync_progress.set_current(0)
    sync_progress.set_message(sync_progress.format_message("Pulling playlists... [{current}/{total}]"))
    for index, playlist in enumerate(playlists, start=1):
        sync_progress.raise_if_stop_requested("Stop requested. Ending after current API call.")
        playlist_id = str(playlist["id"])
        playlist_title = str(playlist.get("snippet", {}).get("title") or playlist_id)
        rows = get_all_playlist_items(playlist_id=playlist_id)
        replace_playlist_items(playlist_id, rows)
        sync_progress.increment()
        sync_progress.set_message(
            sync_progress.format_message("Pulling playlists... [{current}/{total}] {title}", title=playlist_title)
        )


def sync_playlist_analytics(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> None:
    """Sync playlist-level daily analytics rows."""
    playlist_ids = list_playlist_ids()
    if not playlist_ids:
        sync_playlists()
        playlist_ids = list_playlist_ids()
    earliest = get_earliest_date("playlists", "published_at", is_timestamp=True)
    if not earliest:
        return None

    date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
    if date_range is None:
        return None

    latest_by_playlist = {} if deep_sync else get_latest_grouped_dates("playlist_daily_analytics", "playlist_id")
    segments = chunk_date_range(date_range)
    publish_map = build_playlist_publish_map()
    segment_playlist_sets: list[list[str]] = []
    total_playlists = 0
    for segment in segments:
        segment_playlists: list[str] = []
        for playlist_id in playlist_ids:
            publish_date = publish_map.get(playlist_id)
            if publish_date and publish_date > segment.end:
                continue
            latest = latest_by_playlist.get(playlist_id)
            if latest:
                next_date = next_day(latest)
                if next_date > segment.end:
                    continue
            segment_playlists.append(playlist_id)
        segment_playlist_sets.append(segment_playlists)
        total_playlists += len(segment_playlists)
    if total_playlists == 0:
        sync_progress.set_total(1)
        sync_progress.set_current(0)
        sync_progress.set_message(sync_progress.format_message("Playlist analytics [{current}/{total}] no playlists to sync"))
        return None
    sync_progress.set_total(total_playlists)
    sync_progress.set_current(0)
    sync_progress.set_message(sync_progress.format_message("Playlist analytics [{current}/{total}] starting"))
    for segment_index, segment in enumerate(segments, start=1):
        _logger.info(
            "Playlist analytics segment %s/%s: %s -> %s",
            segment_index,
            len(segments),
            segment.start,
            segment.end,
        )
        segment_playlists = segment_playlist_sets[segment_index - 1]
        segment_total = max(len(segment_playlists), 1)
        for playlist_index, playlist_id in enumerate(segment_playlists, start=1):
            sync_progress.raise_if_stop_requested("Stop requested. Ending after current API call.")
            sync_progress.increment()
            sync_progress.set_message(
                sync_progress.format_message(
                    "Playlist analytics [{current}/{total}] {detail}",
                    detail=f"{segment.start} -> {segment.end} Playlist [{playlist_index}/{segment_total}]",
                ),
            )
            latest = latest_by_playlist.get(playlist_id)
            if latest:
                next_date = next_day(latest)
                if next_date > segment.end:
                    continue
            rows = fetch_playlist_daily_metrics(
                playlist_id,
                next_date if latest and next_date > segment.start else segment.start,
                segment.end,
                publish_date=publish_map.get(playlist_id),
            )
            upsert_playlist_daily_analytics(playlist_id, rows)


def sync_all(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
    pulls: list[str] | None = None,
) -> dict:
    """Sync videos and daily analytics, returning a summary payload."""
    sync_progress.init(1)
    selected = {item.lower() for item in pulls} if pulls else None
    try:
        sync_progress.raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "videos"):
            _run_sync_stage("videos", start_date, end_date, deep_sync, sync_videos)
        sync_progress.raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "comments"):
            _run_sync_stage("comments", start_date, end_date, deep_sync, sync_comments)
        sync_progress.raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "audience"):
            _run_sync_stage("audience", start_date, end_date, deep_sync, sync_audience)
        sync_progress.raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "playlists"):
            _run_sync_stage("playlists", start_date, end_date, deep_sync, sync_playlists)
        sync_progress.raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "traffic"):
            _run_sync_stage(
                "traffic",
                start_date,
                end_date,
                deep_sync,
                lambda: sync_traffic_sources(start_date=start_date, end_date=end_date, deep_sync=deep_sync),
            )
        sync_progress.raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "channel_analytics"):
            _run_sync_stage(
                "channel_analytics",
                start_date,
                end_date,
                deep_sync,
                lambda: sync_channel_analytics(start_date=start_date, end_date=end_date, deep_sync=deep_sync),
            )
        sync_progress.raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "playlist_analytics"):
            _run_sync_stage(
                "playlist_analytics",
                start_date,
                end_date,
                deep_sync,
                lambda: sync_playlist_analytics(start_date=start_date, end_date=end_date, deep_sync=deep_sync),
            )
        sync_progress.raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "video_analytics"):
            _run_sync_stage(
                "video_analytics",
                start_date,
                end_date,
                deep_sync,
                lambda: sync_video_analytics(start_date=start_date, end_date=end_date, deep_sync=deep_sync),
            )
        sync_progress.raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "video_traffic_source"):
            _run_sync_stage(
                "video_traffic_source",
                start_date,
                end_date,
                deep_sync,
                lambda: sync_video_traffic_source(start_date=start_date, end_date=end_date, deep_sync=deep_sync),
            )
        sync_progress.raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "video_search_insights"):
            _run_sync_stage(
                "video_search_insights",
                start_date,
                end_date,
                deep_sync,
                lambda: sync_video_search_insights(start_date=start_date, end_date=end_date, deep_sync=deep_sync),
            )
        sync_progress.set_total(1)
        sync_progress.set_current(1)
        sync_progress.mark_done(message=sync_progress.format_message("Pulling sync complete... [{current}/{total}]"))
    except SyncStopRequested as stop_exc:
        sync_progress.mark_stopped(str(stop_exc))
    except Exception:
        sync_progress.mark_failed("Sync failed")
        raise
    return None


def _run_sync_stage(
    stage_key: str,
    start_date: str | None,
    end_date: str | None,
    deep_sync: bool,
    stage_fn,
) -> None:
    """Create a sync run row for one stage, execute it, and finalize its status."""
    started_at = datetime.utcnow().isoformat() + "Z"
    run_id = _create_sync_run(started_at, start_date, end_date, deep_sync, [stage_key])
    try:
        stage_fn()
        _finish_sync_run(run_id, "success")
    except SyncStopRequested as stop_exc:
        _finish_sync_run(run_id, "manual_stop", str(stop_exc))
        raise
    except Exception as exc:
        error_trace = traceback.format_exc()
        _finish_sync_run(run_id, "failed", error_trace if error_trace else str(exc))
        raise


def _should_run(selected: set[str] | None, key: str) -> bool:
    """Return True when a sync step is enabled."""
    if not selected:
        return True
    return key in selected


def _create_sync_run(
    started_at: str,
    start_date: str | None,
    end_date: str | None,
    deep_sync: bool,
    pulls: list[str] | None,
) -> int:
    """Insert a sync run row and return its ID."""
    pulls_value = ",".join(pulls) if pulls else None
    with get_connection() as conn:
        cursor = conn.execute(
            (
                "INSERT INTO sync_runs (started_at, status, start_date, end_date, deep_sync, pulls) "
                "VALUES (?, ?, ?, ?, ?, ?)"
            ),
            (started_at, "running", start_date, end_date, 1 if deep_sync else 0, pulls_value),
        )
        conn.commit()
        return int(cursor.lastrowid)


def _finish_sync_run(run_id: int, status: str, error_message: str | None = None) -> None:
    """Mark a sync run as finished."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE sync_runs SET finished_at = ?, status = ?, error = ?, error_message = ? WHERE id = ?",
            (datetime.utcnow().isoformat() + "Z", status, error_message, error_message, run_id),
        )
        conn.commit()

