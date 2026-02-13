from __future__ import annotations

import traceback
from datetime import datetime, date as date_type, timedelta
from threading import Lock

from utils.logger import get_logger
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
    determine_date_range,
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

_progress_lock = Lock()
_sync_progress: dict[str, object] = {}
_logger = get_logger("sync", filename="sync.log", console=False)
_stop_requested = False


class SyncStopRequested(Exception):
    """Raised when user requested stopping an in-progress sync."""


def sync_videos() -> None:
    """Sync all video metadata into the database."""
    _set_progress(0, 1, _format_pull_progress("videos", 0, 1))
    _logger.info("Starting videos sync")
    videos = safe_get_videos()
    short_video_ids = get_short_video_ids()
    upsert_videos(videos, short_video_ids=short_video_ids)
    _set_progress(1, 1, _format_pull_progress("videos", 1, 1))
    return None


def prune_missing_videos(current_ids: set[str]) -> int:
    """Remove videos (and dependent rows) not present in the current API response."""
    if not current_ids:
        return 0
    with get_connection() as conn:
        existing_rows = conn.execute("SELECT id FROM videos").fetchall()
        existing_ids = {row["id"] for row in existing_rows}
        stale_ids = sorted(existing_ids - current_ids)
        if not stale_ids:
            return 0
        stale_placeholders = ",".join("?" for _ in stale_ids)
        conn.execute(
            f"DELETE FROM video_analytics WHERE video_id IN ({stale_placeholders})",
            tuple(stale_ids),
        )
        conn.execute(f"DELETE FROM videos WHERE id IN ({stale_placeholders})", tuple(stale_ids))
        conn.commit()
    return len(stale_ids)


def get_earliest_upload_date() -> str | None:
    """Return the earliest published date in the videos table."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT MIN(date(published_at)) AS earliest FROM videos"
        ).fetchone()
    if not row or not row["earliest"]:
        return None
    return str(row["earliest"])


def get_latest_video_analytics_dates() -> dict[str, str]:
    """Return a mapping of video_id to latest video analytics date."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT video_id, MAX(date) AS latest FROM video_analytics GROUP BY video_id"
        ).fetchall()
    latest_by_video: dict[str, str] = {}
    for row in rows:
        if row["latest"]:
            latest_by_video[row["video_id"]] = str(row["latest"])
    return latest_by_video


def get_latest_video_traffic_source_dates() -> dict[str, str]:
    """Return a mapping of video_id to latest video traffic-source date."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT video_id, MAX(date) AS latest FROM video_traffic_source GROUP BY video_id"
        ).fetchall()
    latest_by_video: dict[str, str] = {}
    for row in rows:
        if row["latest"]:
            latest_by_video[row["video_id"]] = str(row["latest"])
    return latest_by_video


def get_latest_video_search_insight_dates() -> dict[str, str]:
    """Return a mapping of video_id to latest video-search-insight date."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT video_id, MAX(date) AS latest FROM video_search_insights GROUP BY video_id"
        ).fetchall()
    latest_by_video: dict[str, str] = {}
    for row in rows:
        if row["latest"]:
            latest_by_video[row["video_id"]] = str(row["latest"])
    return latest_by_video


def get_latest_playlist_analytics_dates() -> dict[str, str]:
    """Return a mapping of playlist_id to latest playlist analytics date."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT playlist_id, MAX(date) AS latest FROM playlist_daily_analytics GROUP BY playlist_id"
        ).fetchall()
    latest_by_playlist: dict[str, str] = {}
    for row in rows:
        if row["latest"]:
            latest_by_playlist[row["playlist_id"]] = str(row["latest"])
    return latest_by_playlist


def _get_latest_date(table: str) -> str | None:
    """Return the latest date in a given analytics table."""
    with get_connection() as conn:
        row = conn.execute(f"SELECT MAX(date) AS latest FROM {table}").fetchone()
    if not row or not row["latest"]:
        return None
    return str(row["latest"])


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
        publish_map[row["id"]] = published_at.split("T", 1)[0]
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
        publish_map[row["id"]] = published_at.split("T", 1)[0]
    return publish_map


def get_earliest_playlist_date() -> str | None:
    """Return the earliest published date in the playlists table."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT MIN(date(published_at)) AS earliest FROM playlists"
        ).fetchone()
    if not row or not row["earliest"]:
        return None
    return str(row["earliest"])


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
    earliest = get_earliest_upload_date()
    if not earliest:
        return None

    date_range = determine_date_range(earliest)
    if start_date:
        date_range = DateRange(start=start_date, end=date_range.end)
    if end_date:
        date_range = DateRange(start=date_range.start, end=end_date)
    date_range = _clamp_date_range_to_today(date_range)
    if date_range is None:
        return None

    latest_by_video = {} if deep_sync else get_latest_video_analytics_dates()
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
            next_start = _next_table_sync_start(latest_by_video.get(video_id), segment.start)
            if next_start > segment.end:
                continue
            segment_videos.append(video_id)
        segment_video_sets.append(segment_videos)
        total_videos += len(segment_videos)
    if total_videos == 0:
        _set_progress(0, 1, _format_video_analytics_progress(0, 0, "no videos to sync"))
        return None
    _set_progress(0, total_videos, _format_video_analytics_progress(0, total_videos, "starting"))
    processed_videos = 0

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
            _raise_if_stop_requested("Stop requested. Ending after current API call.")
            processed_videos += 1
            _set_progress(
                processed_videos,
                total_videos,
                _format_video_analytics_progress(
                    processed_videos,
                    total_videos,
                    f"{segment.start} -> {segment.end} Video [{video_index}/{segment_total}]",
                ),
            )
            publish_date = publish_map.get(video_id)
            next_start = _next_table_sync_start(latest_by_video.get(video_id), segment.start)
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
    earliest = get_earliest_upload_date()
    if not earliest:
        return None

    date_range = determine_date_range(earliest)
    if start_date:
        date_range = DateRange(start=start_date, end=date_range.end)
    if end_date:
        date_range = DateRange(start=date_range.start, end=end_date)
    date_range = _clamp_date_range_to_today(date_range)
    if date_range is None:
        return None

    latest_traffic_by_video = {} if deep_sync else get_latest_video_traffic_source_dates()
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
            traffic_start = _next_table_sync_start(latest_traffic_by_video.get(video_id), segment.start)
            if traffic_start > segment.end:
                continue
            segment_videos.append(video_id)
        segment_video_sets.append(segment_videos)
        total_videos += len(segment_videos)
    if total_videos == 0:
        _set_progress(0, 1, _format_video_traffic_progress(0, 0, "no videos to sync"))
        return None
    _set_progress(0, total_videos, _format_video_traffic_progress(0, total_videos, "starting"))
    processed_videos = 0

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
            _raise_if_stop_requested("Stop requested. Ending after current API call.")
            processed_videos += 1
            _set_progress(
                processed_videos,
                total_videos,
                _format_video_traffic_progress(
                    processed_videos,
                    total_videos,
                    f"{segment.start} -> {segment.end} Video [{video_index}/{segment_total}]",
                ),
            )
            publish_date = publish_map.get(video_id)
            traffic_start = _next_table_sync_start(latest_traffic_by_video.get(video_id), segment.start)
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
    earliest = get_earliest_upload_date()
    if not earliest:
        return None

    date_range = determine_date_range(earliest)
    if start_date:
        date_range = DateRange(start=start_date, end=date_range.end)
    if end_date:
        date_range = DateRange(start=date_range.start, end=end_date)
    date_range = _clamp_date_range_to_today(date_range)
    if date_range is None:
        return None

    latest_search_by_video = {} if deep_sync else get_latest_video_search_insight_dates()
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
            search_start = _next_table_sync_start(latest_search_by_video.get(video_id), segment.start)
            if search_start > segment.end:
                continue
            segment_videos.append(video_id)
        segment_video_sets.append(segment_videos)
        total_videos += len(segment_videos)
    if total_videos == 0:
        _set_progress(0, 1, _format_video_search_progress(0, 0, "no videos to sync"))
        return None
    _set_progress(0, total_videos, _format_video_search_progress(0, total_videos, "starting"))
    processed_videos = 0

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
            _raise_if_stop_requested("Stop requested. Ending after current API call.")
            processed_videos += 1
            _set_progress(
                processed_videos,
                total_videos,
                _format_video_search_progress(
                    processed_videos,
                    total_videos,
                    f"{segment.start} -> {segment.end} Video [{video_index}/{segment_total}]",
                ),
            )
            publish_date = publish_map.get(video_id)
            search_start = _next_table_sync_start(latest_search_by_video.get(video_id), segment.start)
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
    earliest = get_earliest_upload_date()
    if not earliest:
        return None
    date_range = determine_date_range(earliest)
    if start_date:
        date_range = DateRange(start=start_date, end=date_range.end)
    if end_date:
        date_range = DateRange(start=date_range.start, end=end_date)
    date_range = _clamp_date_range_to_today(date_range)
    if date_range is None:
        return None
    latest = None if deep_sync else _get_latest_date("channel_analytics")
    if latest:
        next_day = (datetime.fromisoformat(latest).date() + timedelta(days=1)).isoformat()
        if next_day > date_range.start:
            date_range = DateRange(start=next_day, end=date_range.end)
    if date_range.start > date_range.end:
        return None
    segments = chunk_date_range(date_range, months_per_chunk=4)
    _logger.info(
        "Starting channel analytics sync for %s -> %s (%s segments)",
        date_range.start,
        date_range.end,
        len(segments),
    )
    total_rows = 0
    for index, segment in enumerate(segments, start=1):
        _raise_if_stop_requested("Stop requested. Ending after current API call.")
        _set_progress(
            index,
            max(len(segments), 1),
            _format_pull_progress("channel analytics", index, max(len(segments), 1)),
        )
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
    earliest = get_earliest_upload_date()
    if not earliest:
        return None
    date_range = determine_date_range(earliest)
    if start_date:
        date_range = DateRange(start=start_date, end=date_range.end)
    if end_date:
        date_range = DateRange(start=date_range.start, end=end_date)
    date_range = _clamp_date_range_to_today(date_range)
    if date_range is None:
        return None
    latest = None if deep_sync else _get_latest_date("traffic_sources_daily")
    if latest:
        next_day = (datetime.fromisoformat(latest).date() + timedelta(days=1)).isoformat()
        if next_day > date_range.start:
            date_range = DateRange(start=next_day, end=date_range.end)
    if date_range.start > date_range.end:
        return None
    segments = chunk_date_range(date_range, months_per_chunk=12)
    _logger.info(
        "Starting traffic sources sync for %s -> %s (%s segments)",
        date_range.start,
        date_range.end,
        len(segments),
    )
    total_rows = 0
    for index, segment in enumerate(segments, start=1):
        _raise_if_stop_requested("Stop requested. Ending after current API call.")
        _set_progress(
            index,
            max(len(segments), 1),
            _format_pull_progress("traffic sources", index, max(len(segments), 1)),
        )
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
    _set_progress(0, total_videos, _format_pull_progress("comments", 0, total_videos))
    total = 0
    for index, video_id in enumerate(video_ids, start=1):
        _raise_if_stop_requested("Stop requested. Ending after current API call.")
        _logger.info("Comments video %s/%s", index, len(video_ids))
        rows = extract_comments(video_id)
        _set_progress(
            index,
            total_videos,
            _format_pull_progress("comments", index, total_videos),
        )
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
    _set_progress(0, total_playlists, _format_playlist_progress(0, total_playlists))
    for index, playlist in enumerate(playlists, start=1):
        _raise_if_stop_requested("Stop requested. Ending after current API call.")
        playlist_id = str(playlist["id"])
        playlist_title = str(playlist.get("snippet", {}).get("title") or playlist_id)
        rows = get_all_playlist_items(playlist_id=playlist_id)
        replace_playlist_items(playlist_id, rows)
        _set_progress(index, total_playlists, _format_playlist_progress(index, total_playlists, playlist_title))


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
    earliest = get_earliest_playlist_date()
    if not earliest:
        return None

    date_range = determine_date_range(earliest)
    if start_date:
        date_range = DateRange(start=start_date, end=date_range.end)
    if end_date:
        date_range = DateRange(start=date_range.start, end=end_date)
    date_range = _clamp_date_range_to_today(date_range)
    if date_range is None:
        return None

    latest_by_playlist = {} if deep_sync else get_latest_playlist_analytics_dates()
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
                next_day = (datetime.fromisoformat(latest).date() + timedelta(days=1)).isoformat()
                if next_day > segment.end:
                    continue
            segment_playlists.append(playlist_id)
        segment_playlist_sets.append(segment_playlists)
        total_playlists += len(segment_playlists)
    if total_playlists == 0:
        _set_progress(0, 1, _format_playlist_analytics_progress(0, 0, "no playlists to sync"))
        return None
    _set_progress(0, total_playlists, _format_playlist_analytics_progress(0, total_playlists, "starting"))
    processed_playlists = 0
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
            _raise_if_stop_requested("Stop requested. Ending after current API call.")
            processed_playlists += 1
            _set_progress(
                processed_playlists,
                total_playlists,
                _format_playlist_analytics_progress(
                    processed_playlists,
                    total_playlists,
                    f"{segment.start} -> {segment.end} Playlist [{playlist_index}/{segment_total}]",
                ),
            )
            latest = latest_by_playlist.get(playlist_id)
            if latest:
                next_day = (datetime.fromisoformat(latest).date() + timedelta(days=1)).isoformat()
                if next_day > segment.end:
                    continue
            rows = fetch_playlist_daily_metrics(
                playlist_id,
                next_day if latest and next_day > segment.start else segment.start,
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
    _init_progress(1)
    selected = {item.lower() for item in pulls} if pulls else None
    try:
        _raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "videos"):
            _run_sync_stage("videos", start_date, end_date, deep_sync, sync_videos)
        _raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "comments"):
            _run_sync_stage("comments", start_date, end_date, deep_sync, sync_comments)
        _raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "audience"):
            _run_sync_stage("audience", start_date, end_date, deep_sync, sync_audience)
        _raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "playlists"):
            _run_sync_stage("playlists", start_date, end_date, deep_sync, sync_playlists)
        _raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "traffic"):
            _run_sync_stage(
                "traffic",
                start_date,
                end_date,
                deep_sync,
                lambda: sync_traffic_sources(start_date=start_date, end_date=end_date, deep_sync=deep_sync),
            )
        _raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "channel_analytics"):
            _run_sync_stage(
                "channel_analytics",
                start_date,
                end_date,
                deep_sync,
                lambda: sync_channel_analytics(start_date=start_date, end_date=end_date, deep_sync=deep_sync),
            )
        _raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "playlist_analytics"):
            _run_sync_stage(
                "playlist_analytics",
                start_date,
                end_date,
                deep_sync,
                lambda: sync_playlist_analytics(start_date=start_date, end_date=end_date, deep_sync=deep_sync),
            )
        _raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "video_analytics"):
            _run_sync_stage(
                "video_analytics",
                start_date,
                end_date,
                deep_sync,
                lambda: sync_video_analytics(start_date=start_date, end_date=end_date, deep_sync=deep_sync),
            )
        _raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "video_traffic_source"):
            _run_sync_stage(
                "video_traffic_source",
                start_date,
                end_date,
                deep_sync,
                lambda: sync_video_traffic_source(start_date=start_date, end_date=end_date, deep_sync=deep_sync),
            )
        _raise_if_stop_requested("Stop requested.")
        if _should_run(selected, "video_search_insights"):
            _run_sync_stage(
                "video_search_insights",
                start_date,
                end_date,
                deep_sync,
                lambda: sync_video_search_insights(start_date=start_date, end_date=end_date, deep_sync=deep_sync),
            )
        _set_progress(1, 1, _format_pull_progress("sync complete", 1, 1))
        with _progress_lock:
            _sync_progress["status"] = "done"
            _sync_progress["is_syncing"] = False
            _sync_progress["stop_requested"] = False
    except SyncStopRequested as stop_exc:
        with _progress_lock:
            _sync_progress["status"] = "stopped"
            _sync_progress["is_syncing"] = False
            _sync_progress["message"] = str(stop_exc)
            _sync_progress["stop_requested"] = False
    except Exception as exc:
        with _progress_lock:
            _sync_progress["status"] = "failed"
            _sync_progress["is_syncing"] = False
            _sync_progress["message"] = "Sync failed"
            _sync_progress["stop_requested"] = False
        raise
    return None


def prune_missing_videos_task() -> None:
    """Run a prune-only sync to remove missing videos."""
    _init_progress(1)
    started_at = datetime.utcnow().isoformat() + "Z"
    run_id = _create_sync_run(started_at, None, None, False, ["prune"])
    try:
        _set_progress(0, 1, "Pruning missing videos... [0/1]")
        videos = safe_get_videos()
        current_ids = {video.get("id") for video in videos if video.get("id")}
        pruned = prune_missing_videos(current_ids)
        _logger.info("Pruned %s missing videos", pruned)
        _set_progress(1, 1, "Pruning missing videos... [1/1]")
        with _progress_lock:
            _sync_progress["status"] = "done"
            _sync_progress["is_syncing"] = False
        _finish_sync_run(run_id, "success")
    except Exception as exc:
        error_trace = traceback.format_exc()
        with _progress_lock:
            _sync_progress["status"] = "failed"
            _sync_progress["is_syncing"] = False
            _sync_progress["message"] = "Prune failed"
        _finish_sync_run(run_id, "failed", error_trace if error_trace else str(exc))
        raise


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
    if key in selected:
        return True
    aliases = {
        "channel_analytics": {"channel_daily"},
        "video_analytics": {"daily_analytics"},
        "video_traffic_source": {"video_traffic"},
        "video_search_insights": {"video_search"},
    }
    return any(alias in selected for alias in aliases.get(key, set()))


def _init_progress(max_steps: int) -> None:
    """Initialize in-memory sync progress state."""
    global _stop_requested
    with _progress_lock:
        _stop_requested = False
        _sync_progress.clear()
        _sync_progress.update(
            {
                "started_at": datetime.utcnow().isoformat() + "Z",
                "status": "running",
                "is_syncing": True,
                "current_step": 0,
                "max_steps": max_steps,
                "message": "",
                "stop_requested": False,
            }
        )


def _set_progress(current: int, total: int, message: str) -> None:
    """Set the progress counters directly for the current stage."""
    with _progress_lock:
        safe_total = max(int(total), 1)
        safe_current = max(0, min(int(current), safe_total))
        _sync_progress["current_step"] = safe_current
        _sync_progress["max_steps"] = safe_total
        _sync_progress["message"] = message


def _format_pull_progress(label: str, current: int, total: int) -> str:
    """Format a generic pull progress label."""
    return f"Pulling {label}... [{current}/{total}]"


def _format_playlist_progress(current: int, total: int, title: str | None = None) -> str:
    """Format playlist sync progress with optional playlist title detail."""
    base = f"Pulling playlists... [{current}/{total}]"
    if title:
        return f"{base} {title}"
    return base


def _format_video_analytics_progress(current: int, total: int, detail: str | None = None) -> str:
    """Format video analytics progress with range detail."""
    base = f"Video analytics [{current}/{total}]"
    if detail:
        return f"{base} {detail}"
    return base


def _format_video_traffic_progress(current: int, total: int, detail: str | None = None) -> str:
    """Format video traffic-source progress with range detail."""
    base = f"Video traffic source [{current}/{total}]"
    if detail:
        return f"{base} {detail}"
    return base


def _format_video_search_progress(current: int, total: int, detail: str | None = None) -> str:
    """Format video search-insights progress with range detail."""
    base = f"Video search insights [{current}/{total}]"
    if detail:
        return f"{base} {detail}"
    return base


def get_latest_analytics_dates() -> dict[str, str]:
    """Backward-compatible alias for latest video analytics dates."""
    return get_latest_video_analytics_dates()


def build_publish_map() -> dict[str, str]:
    """Backward-compatible alias for video publish-date map."""
    return build_video_publish_map()


def sync_daily_analytics(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
    segments: list[DateRange] | None = None,
) -> None:
    """Backward-compatible alias for video analytics sync."""
    return sync_video_analytics(start_date=start_date, end_date=end_date, deep_sync=deep_sync, segments=segments)


def sync_channel_daily(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> None:
    """Backward-compatible alias for channel analytics sync."""
    return sync_channel_analytics(start_date=start_date, end_date=end_date, deep_sync=deep_sync)


def _format_playlist_analytics_progress(current: int, total: int, detail: str | None = None) -> str:
    """Format playlist analytics progress with optional detail."""
    base = f"Playlist analytics [{current}/{total}]"
    if detail:
        return f"{base} {detail}"
    return base


def _clamp_date_range_to_today(date_range: DateRange) -> DateRange | None:
    """Clamp date range to today; return None if range becomes invalid."""
    today = date_type.today().isoformat()
    if date_range.start > today:
        return None
    if date_range.end > today:
        return DateRange(start=date_range.start, end=today)
    return date_range


def _next_table_sync_start(latest_date: str | None, fallback_start: str) -> str:
    """Return table-specific next sync day, or fallback start when empty."""
    if not latest_date:
        return fallback_start
    return (datetime.fromisoformat(latest_date).date() + timedelta(days=1)).isoformat()


def get_sync_progress() -> dict:
    """Return the current in-memory sync progress state."""
    with _progress_lock:
        return dict(_sync_progress)


def request_sync_stop() -> bool:
    """Request graceful stop for current sync; returns True when accepted."""
    global _stop_requested
    with _progress_lock:
        is_running = bool(_sync_progress.get("is_syncing"))
        if not is_running:
            return False
        _stop_requested = True
        _sync_progress["stop_requested"] = True
        return True


def _raise_if_stop_requested(message: str) -> None:
    """Raise stop exception when a user requested sync stop."""
    with _progress_lock:
        should_stop = _stop_requested
    if should_stop:
        raise SyncStopRequested(message)


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

