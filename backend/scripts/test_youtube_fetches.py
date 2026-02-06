from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Callable

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.append(str(BACKEND_DIR))

from src.youtube.analytics import (
    fetch_channel_daily,
    fetch_daily_metrics,
    fetch_traffic_sources,
)
from src.youtube.comments import extract_comments
from src.youtube.videos import get_all_videos, iter_upload_video_ids


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Smoke-test YouTube API fetches used by sync.py."
    )
    parser.add_argument(
        "--days",
        type=int,
        default=7,
        help="Number of days to fetch for analytics (default: 7).",
    )
    parser.add_argument(
        "--comments-video-id",
        help="Optional video ID to use for comments test (default: first upload).",
    )
    return parser.parse_args()


def date_range(days: int) -> tuple[str, str]:
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    return start.isoformat(), end.isoformat()


def run_step(label: str, fn: Callable[[], int]) -> None:
    print(f"[test] {label} ...", end=" ")
    count = fn()
    print(f"OK ({count} rows)")


def main() -> int:
    args = parse_args()
    start_date, end_date = date_range(args.days)
    print(f"[test] Using date range {start_date} -> {end_date}")

    def test_video_metadata() -> int:
        videos = get_all_videos()
        return len(videos)

    def test_video_ids() -> int:
        return len(list(iter_upload_video_ids()))

    def test_daily_metrics() -> int:
        video_ids = list(iter_upload_video_ids())
        if not video_ids:
            return 0
        rows = fetch_daily_metrics(video_ids[0], start_date, end_date)
        return len(rows)

    def test_channel_daily() -> int:
        rows = fetch_channel_daily(start_date, end_date)
        return len(rows)

    def test_traffic_sources() -> int:
        rows = fetch_traffic_sources(start_date, end_date)
        return len(rows)

    def test_comments() -> int:
        video_id = args.comments_video_id
        if not video_id:
            video_ids = list(iter_upload_video_ids())
            if not video_ids:
                return 0
            video_id = video_ids[0]
        rows = extract_comments(video_id)
        return len(rows)

    run_step("Video metadata (videos.list)", test_video_metadata)
    run_step("Upload video IDs (playlistItems.list)", test_video_ids)
    run_step("Daily video metrics (analytics day)", test_daily_metrics)
    run_step("Channel daily (analytics day)", test_channel_daily)
    run_step("Traffic sources (analytics day, insightTrafficSourceType)", test_traffic_sources)
    run_step("Comments (commentThreads.list for one video)", test_comments)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
