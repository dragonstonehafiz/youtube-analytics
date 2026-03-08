from __future__ import annotations

import argparse
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

BACKEND_DIR = Path(__file__).resolve().parents[1]
if str(BACKEND_DIR) not in sys.path:
    sys.path.append(str(BACKEND_DIR))

from src.youtube.client import get_analytics_client
from src.youtube.videos import iter_upload_video_ids


def get_date_range(days: int = 7) -> tuple[str, str]:
    """Return ISO date range for the last N days."""
    end = date.today() - timedelta(days=1)
    start = end - timedelta(days=days - 1)
    return start.isoformat(), end.isoformat()


def fetch_with_retry(service, request_params: dict, label: str) -> tuple[list[dict[str, Any]], bool]:
    """Attempt to fetch report rows. Returns (rows, success)."""
    try:
        response = service.reports().query(**request_params).execute()
        rows = response.get("rows", []) or []
        headers = [h["name"] for h in response.get("columnHeaders", [])]

        result = []
        for row in rows:
            result.append({headers[i]: row[i] for i in range(len(headers))})

        return result, True
    except Exception as e:
        print(f"  ❌ {label} failed: {str(e)}")
        return [], False


def test_channel_thumbnail_impressions(start_date: str, end_date: str) -> None:
    """Test thumbnail impressions metrics at channel level."""
    print(f"\n📊 Testing Channel-Level Thumbnail Impressions ({start_date} to {end_date})")
    print("=" * 70)

    yt_analytics = get_analytics_client()

    # Test 1: No dimensions (channel aggregate)
    print("\n[1/3] Testing videoThumbnailImpressions (no dimensions - channel aggregate)...")
    params = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "videoThumbnailImpressions,videoThumbnailImpressionsClickRate",
    }
    rows, success = fetch_with_retry(yt_analytics, params, "No dimensions query")
    if success:
        print(f"  ✅ Success! Got {len(rows)} rows")
        if rows:
            print(f"     Sample: {rows[0]}")

    # Test 2: Video dimension (all videos)
    print("\n[2/3] Testing with video dimension (all videos)...")
    params = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "videoThumbnailImpressions,videoThumbnailImpressionsClickRate",
        "dimensions": "video",
    }
    rows, success = fetch_with_retry(yt_analytics, params, "Video dimension query")
    if success:
        print(f"  ✅ Success! Got {len(rows)} rows")
        if rows:
            print(f"     Sample: {rows[0]}")

    # Test 3: Video dimension with day
    print("\n[3/3] Testing with video,day dimensions...")
    params = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "videoThumbnailImpressions,videoThumbnailImpressionsClickRate",
        "dimensions": "video,day",
    }
    rows, success = fetch_with_retry(yt_analytics, params, "Video,day dimensions query")
    if success:
        print(f"  ✅ Success! Got {len(rows)} rows")
        if rows:
            print(f"     Sample: {rows[0]}")


def test_video_thumbnail_impressions(video_id: str, start_date: str, end_date: str) -> None:
    """Test thumbnail impressions metrics for a specific video."""
    print(f"\n🎥 Testing Video-Level Thumbnail Impressions (Video: {video_id})")
    print(f"   Date Range: {start_date} to {end_date}")
    print("=" * 70)

    yt_analytics = get_analytics_client()

    # Test 1: Video filter, no dimensions
    print("\n[1/3] Testing with video filter (no dimensions)...")
    params = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "videoThumbnailImpressions,videoThumbnailImpressionsClickRate",
        "filters": f"video=={video_id}",
    }
    rows, success = fetch_with_retry(yt_analytics, params, "Video filter, no dimensions")
    if success:
        print(f"  ✅ Success! Got {len(rows)} rows")
        if rows:
            print(f"     Sample: {rows[0]}")

    # Test 2: Video filter with video dimension
    print("\n[2/3] Testing with video filter + video dimension...")
    params = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "videoThumbnailImpressions,videoThumbnailImpressionsClickRate",
        "dimensions": "video",
        "filters": f"video=={video_id}",
    }
    rows, success = fetch_with_retry(yt_analytics, params, "Video filter + video dimension")
    if success:
        print(f"  ✅ Success! Got {len(rows)} rows")
        if rows:
            print(f"     Sample: {rows[0]}")

    # Test 3: Video filter with day dimension
    print("\n[3/3] Testing with video filter + day dimension...")
    params = {
        "ids": "channel==MINE",
        "startDate": start_date,
        "endDate": end_date,
        "metrics": "videoThumbnailImpressions,videoThumbnailImpressionsClickRate",
        "dimensions": "day",
        "filters": f"video=={video_id}",
    }
    rows, success = fetch_with_retry(yt_analytics, params, "Video filter + day dimension")
    if success:
        print(f"  ✅ Success! Got {len(rows)} rows")
        if rows:
            print(f"     Sample: {rows[0]}")


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Test videoThumbnailImpressions and videoThumbnailImpressionsClickRate metrics with different dimension combinations"
    )
    parser.add_argument(
        "--days",
        type=int,
        default=7,
        help="Number of days to test (default: 7)",
    )
    parser.add_argument(
        "--video-id",
        help="Optional video ID to test. If not provided, uses first uploaded video.",
    )
    args = parser.parse_args()

    start_date, end_date = get_date_range(args.days)
    print(f"\n📅 Testing with date range: {start_date} to {end_date}\n")

    # Test channel-level
    test_channel_thumbnail_impressions(start_date, end_date)

    # Test video-level
    video_id = args.video_id
    if not video_id:
        print("\n🔍 Finding first uploaded video...")
        video_ids = list(iter_upload_video_ids())
        if not video_ids:
            print("  ❌ No videos found")
            return 1
        video_id = video_ids[0]
        print(f"  ✓ Using video: {video_id}")

    test_video_thumbnail_impressions(video_id, start_date, end_date)

    print("\n" + "=" * 70)
    print("✨ Test complete!\n")
    print("Summary:")
    print("  ✅ = Metric is available with that dimension combination")
    print("  ❌ = Metric is NOT available (or API error)")

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
