from __future__ import annotations

import json
import traceback
from dataclasses import dataclass
from datetime import datetime
from pathlib import Path

from googleapiclient.errors import HttpError

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
from src.database.competitors import upsert_competitor_videos
from src.database.db import get_connection
from src.database.playlist_daily import upsert_playlist_daily_analytics
from src.database.playlists import delete_playlists_not_in, replace_playlist_items, upsert_playlists
from src.database.traffic_sources import upsert_traffic_sources
from src.database.video_search_insights import upsert_video_search_insights
from src.database.video_traffic_source import upsert_video_traffic_source
from src.database.videos import list_playlist_video_ids_missing_video_rows, upsert_videos
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
from src.youtube.videos import (
    fetch_video_details,
    get_short_video_ids,
    get_uploads_playlist_id,
    get_channel_uploads_playlist_id,
    get_all_videos,
)
from src.utils.logger import get_logger
from config import settings

sync_progress = SyncProgress()
sync_logger = get_logger("sync", filename="sync.log")

DATA_STAGES = ["videos", "playlists", "comments", "audience"]
ANALYTICS_STAGES = [
    "playlist_analytics",
    "traffic",
    "channel_analytics",
    "video_analytics",
    "video_traffic_source",
    "video_search_insights",
]

_STAGE_TABLE: dict[str, str] = {
    "videos": "videos",
    "comments": "comments",
    "audience": "audience",
    "playlists": "playlists",
    "videos_competitors": "videos_competitors",
    "playlist_analytics": "playlist_daily_analytics",
    "traffic": "traffic_sources_daily",
    "channel_analytics": "channel_analytics",
    "video_analytics": "video_analytics",
    "video_traffic_source": "video_traffic_source",
    "video_search_insights": "video_search_insights",
}


@dataclass
class SyncQueueItem:
    """A single enqueued sync stage with per-item options."""

    stage: str
    deep_sync: bool = False
    start_date: str | None = None
    end_date: str | None = None


# ── utilities ─────────────────────────────────────────────────────────────────


def _log_sync_error(stage: str, error: Exception, **context: object) -> None:
    """Log sync errors with stage-specific context metadata."""
    context_pairs = [f"{key}={value!r}" for key, value in context.items()]
    context_text = ", ".join(context_pairs) if context_pairs else "no context"
    sync_logger.error("Sync stage '%s' failed: %s | %s", stage, str(error), context_text)


def month_start(iso_date: str) -> str:
    """Return ISO date for the first day of the month containing iso_date."""
    return datetime.fromisoformat(iso_date).date().replace(day=1).isoformat()


def next_month_start(iso_date: str) -> str:
    """Return ISO date for the first day of the month following iso_date."""
    current = datetime.fromisoformat(iso_date).date().replace(day=1)
    if current.month == 12:
        return current.replace(year=current.year + 1, month=1).isoformat()
    return current.replace(month=current.month + 1).isoformat()


def find_next_month_sync_date(latest_date: str | None, fallback_start: str) -> str:
    """Return month-aligned next sync date for monthly-bucketed tables."""
    if not latest_date:
        return fallback_start
    return next_month_start(latest_date)


# ── data API stage functions ─────────────────────────────────────────────────


def sync_videos() -> None:
    """Sync all video metadata into the database."""
    sync_progress.set_total(3)
    sync_progress.raise_if_stop_requested("Stop requested.")
    try:
        api_calls = 1  # For get_uploads_playlist_id
        sync_progress.set_current(0)
        sync_progress.format_message("Pulling videos [{current}/{total}] 0/3: loading uploads")
        uploads_playlist_id = get_uploads_playlist_id()
        sync_progress.increment_api_calls(api_calls)

        # Fetch shorts upfront so we know which videos are shorts
        sync_progress.set_current(1)
        sync_progress.format_message("Pulling videos [{current}/{total}] 1/3: finding all shorts")
        short_video_ids, fetch_api_calls = get_short_video_ids(uploads_playlist_id)
        sync_progress.increment_api_calls(fetch_api_calls)

        # Callback to upsert each batch with shorts info
        def on_batch(batch_videos):
            upsert_videos(batch_videos, short_video_ids=short_video_ids)

        sync_progress.set_current(2)
        sync_progress.format_message("Pulling videos [{current}/{total}] 2/3: finding all videos and details")

        videos, fetch_api_calls = get_all_videos(uploads_playlist_id, on_batch=on_batch)
        sync_progress.increment_api_calls(fetch_api_calls)
    except HttpError as exc:
        raise RuntimeError(f"YouTube API error: {exc}") from exc
    sync_progress.increment()


def sync_competitors() -> None:
    """Sync competitor channel videos into videos_competitors table."""
    # Create sync run to track this operation
    run_id = _create_sync_run("videos_competitors", None, None, False)
    api_calls_before = sync_progress.get_api_calls()

    try:
        competitors_json_path = settings.data_dir / "competitors.json"

        # Load competitors config
        if not competitors_json_path.exists():
            sync_progress.set_total(1)
            sync_progress.set_current(0)
            sync_progress.format_message("Syncing competitors [{current}/{total}] no competitors configured")
            api_delta = sync_progress.get_api_calls() - api_calls_before
            _finish_sync_run(run_id, "success", api_delta)
            return

        try:
            with open(competitors_json_path, "r") as f:
                competitors_config = json.load(f)
        except (json.JSONDecodeError, OSError) as exc:
            raise RuntimeError(f"Failed to load competitors.json: {exc}") from exc

        # Filter to enabled competitors
        enabled_competitors = [
            (config.get("label"), config.get("channel_id"))
            for config in competitors_config.values()
            if isinstance(config, dict) and config.get("enabled", False)
        ]

        if not enabled_competitors:
            sync_progress.set_total(1)
            sync_progress.set_current(0)
            sync_progress.format_message("Syncing competitors [{current}/{total}] no competitors enabled")
            api_delta = sync_progress.get_api_calls() - api_calls_before
            _finish_sync_run(run_id, "success", api_delta)
            return

        competitor_count = len(enabled_competitors)
        sync_progress.set_total(competitor_count)
        sync_progress.set_current(0)

        all_short_ids: set[str] = set()

        for name, channel_id in enabled_competitors:
            sync_progress.raise_if_stop_requested("Stop requested.")
            sync_progress.format_message("Syncing competitors [{current}/{total}] {detail}", detail=name)

            try:
                # Get uploads playlist ID
                uploads_playlist_id = get_channel_uploads_playlist_id(channel_id)
                sync_progress.increment_api_calls(1)

                # Fetch shorts upfront
                short_ids, fetch_api_calls = get_short_video_ids(uploads_playlist_id)
                all_short_ids.update(short_ids)
                sync_progress.increment_api_calls(fetch_api_calls)

                # Callback to upsert each batch with shorts info
                def on_batch(batch_videos):
                    upsert_competitor_videos(batch_videos, short_video_ids=short_ids)

                # Fetch videos (upserts happen in callback)
                videos, fetch_api_calls = get_all_videos(uploads_playlist_id, on_batch=on_batch)
                sync_progress.increment_api_calls(fetch_api_calls)
            except HttpError as exc:
                raise RuntimeError(f"YouTube API error for channel {name} ({channel_id}): {exc}") from exc

            sync_progress.increment()

        sync_progress.format_message("Syncing competitors [{current}/{total}] complete")

        # Update row counts and channel name in config
        with get_connection() as conn:
            for name, channel_id in enabled_competitors:
                row_count = conn.execute(
                    "SELECT COUNT(*) FROM videos_competitors WHERE channel_id = ?",
                    (channel_id,)
                ).fetchone()[0]
                # Get the channel_title from one of the videos
                channel_title_row = conn.execute(
                    "SELECT channel_title FROM videos_competitors WHERE channel_id = ? LIMIT 1",
                    (channel_id,)
                ).fetchone()
                channel_title = channel_title_row["channel_title"] if channel_title_row else name
                # Find the config entry for this competitor and update row count and label
                for key, config in competitors_config.items():
                    if isinstance(config, dict) and config.get("channel_id") == channel_id:
                        config["row_count"] = row_count
                        config["label"] = channel_title
                        break

        # Save updated config back to file
        try:
            with open(competitors_json_path, "w") as f:
                json.dump(competitors_config, f, indent=2)
        except (OSError, IOError) as exc:
            sync_logger.warning("Failed to update competitors.json with row counts: %s", exc)

        api_delta = sync_progress.get_api_calls() - api_calls_before
        _finish_sync_run(run_id, "success", api_delta)
        sync_progress.mark_done("Competitors sync complete")
    except SyncStopRequested as exc:
        api_delta = sync_progress.get_api_calls() - api_calls_before
        _finish_sync_run(run_id, "stopped", api_delta)
        sync_progress.mark_stopped(str(exc))
        raise
    except Exception as exc:
        api_delta = sync_progress.get_api_calls() - api_calls_before
        error_trace = traceback.format_exc() or str(exc)
        _finish_sync_run(run_id, "failed", api_delta, error=error_trace)
        _log_sync_error("competitors", exc)
        sync_progress.mark_failed("Competitors sync failed unexpectedly")
        raise


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
        publish_map[row["id"]] = normalize_iso_datetime_to_date(str(row["published_at"]))
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
) -> None:
    """Sync video-level daily analytics rows."""
    video_ids = list_video_ids()
    if not video_ids:
        sync_videos()
        video_ids = list_video_ids()
    earliest = get_earliest_date("videos", "published_at", is_timestamp=True)
    if not earliest:
        return
    date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
    if date_range is None:
        return
    latest_by_video = {} if deep_sync else get_latest_grouped_dates("video_analytics", "video_id")
    segments = chunk_date_range(date_range)
    publish_map = build_video_publish_map()
    segment_video_sets: list[list[str]] = []
    total_videos = 0
    for segment in segments:
        segment_videos: list[str] = []
        for video_id in video_ids:
            publish_date = publish_map.get(video_id)
            if publish_date and publish_date > segment.end:
                continue
            next_start = find_next_sync_date(latest_by_video.get(video_id), segment.start)
            if max(next_start, segment.start) > segment.end:
                continue
            segment_videos.append(video_id)
        segment_video_sets.append(segment_videos)
        total_videos += len(segment_videos)
    if total_videos == 0:
        sync_progress.set_total(1)
        sync_progress.set_current(0)
        sync_progress.format_message("Video analytics [{current}/{total}] nothing to sync")
        return
    sync_progress.set_total(total_videos)
    sync_progress.set_current(0)
    sync_progress.format_message("Video analytics [{current}/{total}] starting")
    for segment_index, segment in enumerate(segments, start=1):
        segment_videos = segment_video_sets[segment_index - 1]
        segment_total = max(len(segment_videos), 1)
        for video_index, video_id in enumerate(segment_videos, start=1):
            sync_progress.raise_if_stop_requested("Stop requested.")
            sync_progress.format_message(
                "Video analytics [{current}/{total}] {detail}",
                detail=f"{segment.start} → {segment.end} [{video_index}/{segment_total}]",
            )
            publish_date = publish_map.get(video_id)
            next_start = find_next_sync_date(latest_by_video.get(video_id), segment.start)
            query_start = max(next_start, segment.start)
            if query_start > segment.end:
                continue
            rows, video_api_calls = fetch_video_daily_metrics(video_id, query_start, segment.end, publish_date=publish_date)
            sync_progress.increment_api_calls(video_api_calls)
            upsert_daily_analytics(video_id, rows)
            latest_by_video[video_id] = segment.end
            sync_progress.increment()


def sync_video_traffic_source(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> None:
    """Sync per-video daily traffic-source rows."""
    video_ids = list_video_ids()
    if not video_ids:
        sync_videos()
        video_ids = list_video_ids()
    earliest = get_earliest_date("videos", "published_at", is_timestamp=True)
    if not earliest:
        return
    date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
    if date_range is None:
        return
    latest_by_video = {} if deep_sync else get_latest_grouped_dates("video_traffic_source", "video_id")
    segments = chunk_date_range(date_range)
    publish_map = build_video_publish_map()
    segment_video_sets: list[list[str]] = []
    total_videos = 0
    for segment in segments:
        segment_videos: list[str] = []
        for video_id in video_ids:
            publish_date = publish_map.get(video_id)
            if publish_date and publish_date > segment.end:
                continue
            next_start = find_next_sync_date(latest_by_video.get(video_id), segment.start)
            if max(next_start, segment.start) > segment.end:
                continue
            segment_videos.append(video_id)
        segment_video_sets.append(segment_videos)
        total_videos += len(segment_videos)
    if total_videos == 0:
        sync_progress.set_total(1)
        sync_progress.set_current(0)
        sync_progress.format_message("Video traffic source [{current}/{total}] nothing to sync")
        return
    sync_progress.set_total(total_videos)
    sync_progress.set_current(0)
    sync_progress.format_message("Video traffic source [{current}/{total}] starting")
    for segment_index, segment in enumerate(segments, start=1):
        segment_videos = segment_video_sets[segment_index - 1]
        segment_total = max(len(segment_videos), 1)
        for video_index, video_id in enumerate(segment_videos, start=1):
            sync_progress.raise_if_stop_requested("Stop requested.")
            sync_progress.format_message(
                "Video traffic source [{current}/{total}] {detail}",
                detail=f"{segment.start} → {segment.end} [{video_index}/{segment_total}]",
            )
            publish_date = publish_map.get(video_id)
            next_start = find_next_sync_date(latest_by_video.get(video_id), segment.start)
            query_start = max(next_start, segment.start)
            if query_start > segment.end:
                continue
            rows, traffic_api_calls = fetch_video_traffic_source_metrics(video_id, query_start, segment.end, publish_date=publish_date)
            sync_progress.increment_api_calls(traffic_api_calls)
            upsert_video_traffic_source(video_id, rows)
            latest_by_video[video_id] = segment.end
            sync_progress.increment()


def sync_video_search_insights(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> None:
    """Sync per-video monthly search insight rows."""
    video_ids = list_video_ids()
    if not video_ids:
        sync_videos()
        video_ids = list_video_ids()
    earliest = get_earliest_date("videos", "published_at", is_timestamp=True)
    if not earliest:
        return
    date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
    if date_range is None:
        return
    latest_by_video = {} if deep_sync else get_latest_grouped_dates("video_search_insights", "video_id")
    month_aligned_range = DateRange(start=month_start(date_range.start), end=date_range.end)
    segments = chunk_date_range(month_aligned_range)
    publish_map = build_video_publish_map()
    segment_video_sets: list[list[str]] = []
    total_videos = 0
    for segment in segments:
        segment_videos: list[str] = []
        for video_id in video_ids:
            publish_date = publish_map.get(video_id)
            if publish_date and publish_date > segment.end:
                continue
            segment_start = max(segment.start, date_range.start)
            search_start = find_next_month_sync_date(latest_by_video.get(video_id), segment_start)
            if max(search_start, segment_start) > segment.end:
                continue
            segment_videos.append(video_id)
        segment_video_sets.append(segment_videos)
        total_videos += len(segment_videos)
    if total_videos == 0:
        sync_progress.set_total(1)
        sync_progress.set_current(0)
        sync_progress.format_message("Video search insights [{current}/{total}] nothing to sync")
        return
    sync_progress.set_total(total_videos)
    sync_progress.set_current(0)
    sync_progress.format_message("Video search insights [{current}/{total}] starting")
    for segment_index, segment in enumerate(segments, start=1):
        segment_videos = segment_video_sets[segment_index - 1]
        segment_total = max(len(segment_videos), 1)
        for video_index, video_id in enumerate(segment_videos, start=1):
            sync_progress.raise_if_stop_requested("Stop requested.")
            sync_progress.format_message(
                "Video search insights [{current}/{total}] {detail}",
                detail=f"{segment.start} → {segment.end} [{video_index}/{segment_total}]",
            )
            publish_date = publish_map.get(video_id)
            segment_start = max(segment.start, date_range.start)
            search_start = find_next_month_sync_date(latest_by_video.get(video_id), segment_start)
            query_start = max(search_start, segment_start)
            if query_start > segment.end:
                continue
            rows, search_api_calls = fetch_video_search_insight_metrics(video_id, query_start, segment.end, publish_date=publish_date)
            sync_progress.increment_api_calls(search_api_calls)
            upsert_video_search_insights(video_id, rows)
            latest_by_video[video_id] = month_start(segment.end)
            sync_progress.increment()


def sync_channel_analytics(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> None:
    """Sync channel-level daily analytics rows."""
    earliest = get_earliest_date("videos", "published_at", is_timestamp=True)
    if not earliest:
        return
    date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
    if date_range is None:
        return
    latest = None if deep_sync else get_latest_date("channel_analytics")
    if latest:
        next_date = next_day(latest)
        if next_date > date_range.start:
            date_range = DateRange(start=next_date, end=date_range.end)
    if date_range.start > date_range.end:
        return
    segments = chunk_date_range(date_range, months_per_chunk=4)
    sync_progress.set_total(max(len(segments), 1))
    sync_progress.set_current(0)
    for index, segment in enumerate(segments, start=1):
        sync_progress.raise_if_stop_requested("Stop requested.")
        sync_progress.format_message(
            "Channel analytics [{current}/{total}] {detail}",
            detail=f"{segment.start} → {segment.end} [{index}/{len(segments)}]",
        )
        rows, channel_api_calls = fetch_channel_analytics(segment.start, segment.end)
        sync_progress.increment_api_calls(channel_api_calls)
        upsert_channel_daily(rows)
        sync_progress.increment()


def sync_traffic_sources(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> None:
    """Sync traffic source analytics rows."""
    earliest = get_earliest_date("videos", "published_at", is_timestamp=True)
    if not earliest:
        return
    date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
    if date_range is None:
        return
    latest = None if deep_sync else get_latest_date("traffic_sources_daily")
    if latest:
        next_date = next_day(latest)
        if next_date > date_range.start:
            date_range = DateRange(start=next_date, end=date_range.end)
    if date_range.start > date_range.end:
        return
    segments = chunk_date_range(date_range, months_per_chunk=12)
    sync_progress.set_total(max(len(segments), 1))
    sync_progress.set_current(0)
    for index, segment in enumerate(segments, start=1):
        sync_progress.raise_if_stop_requested("Stop requested.")
        sync_progress.format_message(
            "Traffic sources [{current}/{total}] {detail}",
            detail=f"{segment.start} → {segment.end} [{index}/{len(segments)}]",
        )
        rows, traffic_api_calls = fetch_traffic_sources(segment.start, segment.end)
        sync_progress.increment_api_calls(traffic_api_calls)
        upsert_traffic_sources(rows)
        sync_progress.increment()


def sync_comments() -> None:
    """Sync all comments for all videos."""
    video_ids = list_video_ids()
    if not video_ids:
        sync_videos()
        video_ids = list_video_ids()
    total_videos = max(len(video_ids), 1)
    sync_progress.set_total(total_videos)
    sync_progress.set_current(0)
    sync_progress.format_message("Pulling comments [{current}/{total}]")
    for video_id in video_ids:
        sync_progress.raise_if_stop_requested("Stop requested.")
        rows, comments_api_calls = extract_comments(video_id)
        sync_progress.increment_api_calls(comments_api_calls)
        upsert_comments(rows)
        sync_progress.increment()
        sync_progress.format_message("Pulling comments [{current}/{total}]")


def sync_audience() -> None:
    """Sync public subscribers then backfill commenter-only audience from comments."""
    sync_progress.set_total(1)
    sync_progress.set_current(0)
    sync_progress.format_message("Pulling audience [{current}/{total}]")
    sync_progress.raise_if_stop_requested("Stop requested.")
    subscriber_rows, audience_api_calls = extract_public_subscribers()
    sync_progress.increment_api_calls(audience_api_calls)
    upsert_audience(subscriber_rows)
    upsert_commenters_from_comments()
    sync_progress.set_current(1)
    sync_progress.format_message("Pulling audience [{current}/{total}] complete")


def sync_playlists() -> None:
    """Sync playlists and playlist items."""
    sync_progress.set_total(1)
    sync_progress.set_current(0)
    sync_progress.format_message("Pulling playlists [{current}/{total}] loading playlists")
    sync_progress.raise_if_stop_requested("Stop requested.")
    playlists, playlists_api_calls = get_all_playlists()
    playlists = [p for p in playlists if p.get("id")]
    sync_progress.increment_api_calls(playlists_api_calls)
    upsert_playlists(playlists)
    delete_playlists_not_in([str(p["id"]) for p in playlists])
    total_playlists = max(len(playlists), 1)
    sync_progress.set_total(total_playlists)
    sync_progress.set_current(0)
    sync_progress.format_message("Pulling playlists [{current}/{total}]")
    for playlist in playlists:
        sync_progress.raise_if_stop_requested("Stop requested.")
        playlist_id = str(playlist["id"])
        playlist_title = str(playlist.get("snippet", {}).get("title") or playlist_id)
        rows, items_api_calls = get_all_playlist_items(playlist_id=playlist_id)
        sync_progress.increment_api_calls(items_api_calls)
        replace_playlist_items(playlist_id, rows)
        sync_progress.increment()
        sync_progress.format_message("Pulling playlists [{current}/{total}] {title}", title=playlist_title)

    sync_progress.format_message("Pulling playlists: reconciling missing videos")
    sync_progress.raise_if_stop_requested("Stop requested.")
    missing_video_ids = list_playlist_video_ids_missing_video_rows()
    recovered_videos: list[dict] = []
    for index in range(0, len(missing_video_ids), 50):
        sync_progress.raise_if_stop_requested("Stop requested.")
        batch_videos, batch_api_calls = fetch_video_details(missing_video_ids[index : index + 50])
        recovered_videos.extend(batch_videos)
        sync_progress.increment_api_calls(batch_api_calls)
    if recovered_videos:
        upsert_videos(recovered_videos)


# ── analytics API stage functions ───────────────────────────────────────────


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
        return
    date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
    if date_range is None:
        return
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
            resume_start = next_day(latest) if latest else segment.start
            query_start = max(resume_start, segment.start)
            if query_start > segment.end:
                continue
            segment_playlists.append(playlist_id)
        segment_playlist_sets.append(segment_playlists)
        total_playlists += len(segment_playlists)
    if total_playlists == 0:
        sync_progress.set_total(1)
        sync_progress.set_current(0)
        sync_progress.format_message("Playlist analytics [{current}/{total}] nothing to sync")
        return
    sync_progress.set_total(total_playlists)
    sync_progress.set_current(0)
    sync_progress.format_message("Playlist analytics [{current}/{total}] starting")
    for segment_index, segment in enumerate(segments, start=1):
        segment_playlists = segment_playlist_sets[segment_index - 1]
        segment_total = max(len(segment_playlists), 1)
        for playlist_index, playlist_id in enumerate(segment_playlists, start=1):
            sync_progress.raise_if_stop_requested("Stop requested.")
            sync_progress.format_message(
                "Playlist analytics [{current}/{total}] {detail}",
                detail=f"{segment.start} → {segment.end} [{playlist_index}/{segment_total}]",
            )
            latest = latest_by_playlist.get(playlist_id)
            resume_start = next_day(latest) if latest else segment.start
            query_start = max(resume_start, segment.start)
            if query_start > segment.end:
                continue
            rows, playlist_api_calls = fetch_playlist_daily_metrics(
                playlist_id, query_start, segment.end, publish_date=publish_map.get(playlist_id)
            )
            sync_progress.increment_api_calls(playlist_api_calls)
            upsert_playlist_daily_analytics(playlist_id, rows)
            latest_by_playlist[playlist_id] = segment.end
            sync_progress.increment()


def sync_all(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
    pulls: list[str] | None = None,
) -> dict:
    """[Removed] Use sync_data() or sync_analytics() instead."""
    raise NotImplementedError("sync_all has been removed. Use sync_data() or sync_analytics().")


# ── stage runner ────────────────────────────────────────────────────────────────


def _should_run(selected: set[str] | None, key: str) -> bool:
    """Return True when a sync step is enabled (no filter = all enabled)."""
    if not selected:
        return True
    return key in selected


def _get_earliest_for_table(table_name: str) -> str | None:
    """Get the earliest date for a given table to resolve None date ranges.

    Only analytics tables have meaningful date ranges. Data tables (videos, playlists,
    comments, audience, videos_competitors) pull all data from YouTube API regardless
    of dates, so they don't need date resolution.
    """
    # Analytics tables that depend on videos' published dates
    if table_name in ("video_analytics", "video_traffic_source", "video_search_insights", "traffic_sources_daily", "channel_analytics"):
        return get_earliest_date("videos", "published_at", is_timestamp=True)

    # Analytics tables that depend on playlists' published dates
    if table_name == "playlist_daily_analytics":
        return get_earliest_date("playlists", "published_at", is_timestamp=True)

    # Data tables don't have meaningful date ranges
    return None


def _create_sync_run(
    table_name: str,
    start_date: str | None,
    end_date: str | None,
    deep_sync: bool,
) -> int:
    """Insert a sync_runs row and return its ID.

    Resolves None start_date/end_date to actual dates from the database.
    """
    resolved_start = start_date
    resolved_end = end_date

    # Resolve None dates by querying the database for earliest/latest actual dates
    if resolved_start is None or resolved_end is None:
        earliest = _get_earliest_for_table(table_name)
        if earliest:
            date_range = build_sync_date_range(earliest, start_date=start_date, end_date=end_date)
            if date_range:
                resolved_start = date_range.start
                resolved_end = date_range.end

    with get_connection() as conn:
        cursor = conn.execute(
            "INSERT INTO sync_runs (started_at, start_date, end_date, table_name, deep_sync, status) "
            "VALUES (?, ?, ?, ?, ?, 'running')",
            (datetime.utcnow().isoformat() + "Z", resolved_start, resolved_end, table_name, 1 if deep_sync else 0),
        )
        conn.commit()
        return int(cursor.lastrowid)


def _finish_sync_run(
    run_id: int,
    status: str,
    total_api_calls: int,
    error: str | None = None,
) -> None:
    """Mark a sync_runs row as finished."""
    with get_connection() as conn:
        conn.execute(
            "UPDATE sync_runs SET finished_at = ?, status = ?, total_api_calls = ?, error = ? WHERE id = ?",
            (datetime.utcnow().isoformat() + "Z", status, total_api_calls, error, run_id),
        )
        conn.commit()


def _run_sync_stage(
    stage_key: str,
    stage_fn,
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> None:
    """Create a sync_runs row for one stage, execute it, and finalize its status.

    SyncStopRequested propagates upward to halt the enclosing sync.
    All other exceptions are caught, recorded in the DB row, and logged so
    the remaining stages continue (failure isolation).
    """
    table_name = _STAGE_TABLE.get(stage_key, stage_key)
    run_id = _create_sync_run(table_name, start_date, end_date, deep_sync)
    api_calls_before = sync_progress.get_api_calls()
    try:
        stage_fn()
        api_delta = sync_progress.get_api_calls() - api_calls_before
        _finish_sync_run(run_id, "success", api_delta)
    except SyncStopRequested as exc:
        api_delta = sync_progress.get_api_calls() - api_calls_before
        _finish_sync_run(run_id, "stopped", api_delta)
        raise
    except Exception as exc:
        api_delta = sync_progress.get_api_calls() - api_calls_before
        error_trace = traceback.format_exc() or str(exc)
        _finish_sync_run(run_id, "failed", api_delta, error=error_trace)
        _log_sync_error(stage_key, exc)


# ── entry points ─────────────────────────────────────────────────────────────────


def sync_data(items: list[SyncQueueItem]) -> None:
    """Run queued YouTube Data API v3 stages, each with its own deep_sync option.

    Called by the route handler as a BackgroundTask after try_start() succeeds.
    Items are processed in order; each creates an individual sync_runs row.
    """
    _stage_fn = {
        "videos": sync_videos,
        "comments": sync_comments,
        "audience": sync_audience,
        "playlists": sync_playlists,
    }
    try:
        for item in items:
            sync_progress.raise_if_stop_requested("Stop requested.")
            fn = _stage_fn.get(item.stage)
            if fn is None:
                continue
            _run_sync_stage(item.stage, fn, deep_sync=item.deep_sync)
        sync_progress.mark_done("Data sync complete")
    except SyncStopRequested as exc:
        sync_progress.mark_stopped(str(exc))
    except Exception:
        sync_progress.mark_failed("Data sync failed unexpectedly")
        raise


def sync_analytics(items: list[SyncQueueItem]) -> None:
    """Run queued YouTube Analytics API v2 stages, each with its own options.

    Called by the route handler as a BackgroundTask after try_start() succeeds.
    Items are processed in order; each creates an individual sync_runs row.
    """
    try:
        for item in items:
            sync_progress.raise_if_stop_requested("Stop requested.")
            sd, ed, ds = item.start_date, item.end_date, item.deep_sync
            if item.stage == "playlist_analytics":
                fn = lambda s=sd, e=ed, d=ds: sync_playlist_analytics(start_date=s, end_date=e, deep_sync=d)
            elif item.stage == "traffic":
                fn = lambda s=sd, e=ed, d=ds: sync_traffic_sources(start_date=s, end_date=e, deep_sync=d)
            elif item.stage == "channel_analytics":
                fn = lambda s=sd, e=ed, d=ds: sync_channel_analytics(start_date=s, end_date=e, deep_sync=d)
            elif item.stage == "video_analytics":
                fn = lambda s=sd, e=ed, d=ds: sync_video_analytics(start_date=s, end_date=e, deep_sync=d)
            elif item.stage == "video_traffic_source":
                fn = lambda s=sd, e=ed, d=ds: sync_video_traffic_source(start_date=s, end_date=e, deep_sync=d)
            elif item.stage == "video_search_insights":
                fn = lambda s=sd, e=ed, d=ds: sync_video_search_insights(start_date=s, end_date=e, deep_sync=d)
            else:
                continue
            _run_sync_stage(
                item.stage, fn,
                start_date=item.start_date, end_date=item.end_date, deep_sync=item.deep_sync,
            )
        sync_progress.mark_done("Analytics sync complete")
    except SyncStopRequested as exc:
        sync_progress.mark_stopped(str(exc))
    except Exception:
        sync_progress.mark_failed("Analytics sync failed unexpectedly")
        raise

