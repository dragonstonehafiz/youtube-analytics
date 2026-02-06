from __future__ import annotations

from datetime import datetime, date as date_type, timedelta

from src.database.analytics import upsert_daily_analytics
from src.database.db import get_connection
from src.database.videos import upsert_videos
from src.youtube.analytics import (
    DateRange,
    chunk_date_range,
    determine_date_range,
    fetch_daily_metrics,
)
from src.youtube.videos import safe_get_videos
from tqdm.auto import tqdm


def sync_videos() -> dict:
    """Sync all video metadata into the database."""
    videos = safe_get_videos()
    inserted = upsert_videos(videos)
    return {"videos_synced": inserted}


def get_earliest_upload_date() -> str | None:
    """Return the earliest published date in the videos table."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT MIN(date(published_at)) AS earliest FROM videos"
        ).fetchone()
    if not row or not row["earliest"]:
        return None
    return str(row["earliest"])


def get_latest_analytics_dates() -> dict[str, str]:
    """Return a mapping of video_id to latest analytics date."""
    with get_connection() as conn:
        rows = conn.execute(
            "SELECT video_id, MAX(date) AS latest FROM daily_analytics GROUP BY video_id"
        ).fetchall()
    latest_by_video: dict[str, str] = {}
    for row in rows:
        if row["latest"]:
            latest_by_video[row["video_id"]] = str(row["latest"])
    return latest_by_video


def list_video_ids() -> list[str]:
    """Return all video IDs from the videos table."""
    with get_connection() as conn:
        rows = conn.execute("SELECT id FROM videos").fetchall()
    return [row["id"] for row in rows]


def build_publish_map() -> dict[str, str]:
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


def sync_daily_analytics(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> dict:
    """Sync daily analytics rows into the database."""
    video_ids = list_video_ids()
    if not video_ids:
        sync_videos()
        video_ids = list_video_ids()
    earliest = get_earliest_upload_date()
    if not earliest:
        return {"daily_analytics_synced": 0}

    date_range = determine_date_range(earliest)
    if start_date:
        date_range = DateRange(start=start_date, end=date_range.end)
    if end_date:
        date_range = DateRange(start=date_range.start, end=end_date)
    if date_range.start > date_range.end:
        return {
            "daily_analytics_synced": 0,
            "daily_analytics_range": {"start": date_range.start, "end": date_range.end},
            "segments": 0,
            "videos": len(video_ids),
        }

    latest_by_video = {} if deep_sync else get_latest_analytics_dates()
    segments = chunk_date_range(date_range)
    publish_map = build_publish_map()
    print(
        f"[sync] daily analytics range: {date_range.start} -> {date_range.end} "
        f"({len(segments)} segments, {len(video_ids)} videos)"
    )
    total_rows = 0

    for segment in segments:
        segment_videos = []
        for video_id in video_ids:
            publish_date = publish_map.get(video_id)
            if publish_date and publish_date > segment.end:
                continue
            segment_videos.append(video_id)
        print(
            f"[sync] segment: {segment.start} -> {segment.end} "
            f"({len(segment_videos)}/{len(video_ids)} videos)"
        )
        for video_id in tqdm(
            segment_videos,
            desc=f"{segment.start} -> {segment.end}",
            unit="video",
            leave=False,
        ):
            latest = latest_by_video.get(video_id)
            # Resume per video from the day after the latest stored row.
            if latest:
                next_day = (datetime.fromisoformat(latest).date() + timedelta(days=1)).isoformat()
                if next_day > segment.end:
                    continue
            rows = fetch_daily_metrics(
                video_id,
                next_day if latest and next_day > segment.start else segment.start,
                segment.end,
                publish_date=publish_map.get(video_id),
            )
            total_rows += upsert_daily_analytics(video_id, rows)

    return {
        "daily_analytics_synced": total_rows,
        "daily_analytics_range": {"start": date_range.start, "end": date_range.end},
        "segments": len(segments),
        "videos": len(video_ids),
    }


def sync_all(
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> dict:
    """Sync videos and daily analytics, returning a summary payload."""
    results = {}
    results.update(sync_videos())
    results.update(sync_daily_analytics(start_date=start_date, end_date=end_date, deep_sync=deep_sync))
    results["synced_at"] = datetime.utcnow().isoformat() + "Z"
    return results
