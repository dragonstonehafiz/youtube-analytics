#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from datetime import datetime
from pathlib import Path
from typing import Any, Sequence

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

import pandas as pd
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from utils.auth import get_credentials
from utils.config import CLIENT_SECRETS_FILE, DATA_DIR, SCOPES, TOKEN_FILE
from utils.youtube import list_channel_video_ids


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export one metadata row per video in the channel uploads playlist.")
    parser.add_argument(
        "--output",
        help="CSV destination. Defaults to data/video_data_<timestamp>.csv (directory created if missing).",
    )
    return parser.parse_args()


def video_item_to_record(item: dict[str, Any]) -> dict[str, Any]:
    snippet = item.get("snippet", {})
    status = item.get("status", {})
    statistics = item.get("statistics", {})
    content_details = item.get("contentDetails", {})
    tags = snippet.get("tags") or []
    if isinstance(tags, Sequence) and not isinstance(tags, str):
        tags_repr = ";".join(tags)
    else:
        tags_repr = str(tags)
    return {
        "video_id": item.get("id", ""),
        "title": snippet.get("title", ""),
        "description": snippet.get("description", ""),
        "published_at": snippet.get("publishedAt", ""),
        "channel_title": snippet.get("channelTitle", ""),
        "category_id": snippet.get("categoryId", ""),
        "default_language": snippet.get("defaultLanguage", ""),
        "privacy_status": status.get("privacyStatus", ""),
        "made_for_kids": status.get("madeForKids", ""),
        "duration": content_details.get("duration", ""),
        "dimension": content_details.get("dimension", ""),
        "definition": content_details.get("definition", ""),
        "caption": content_details.get("caption", ""),
        "licensed_content": content_details.get("licensedContent", ""),
        "projection": content_details.get("projection", ""),
        "tags": tags_repr,
        "view_count": statistics.get("viewCount", ""),
        "like_count": statistics.get("likeCount", ""),
        "comment_count": statistics.get("commentCount", ""),
    }


def fetch_video_metadata(youtube_service, video_ids: Sequence[str]) -> list[dict[str, Any]]:
    records: list[dict[str, Any]] = []
    for start in range(0, len(video_ids), 50):
        batch = video_ids[start : start + 50]
        response = youtube_service.videos().list(
            part="snippet,contentDetails,statistics,status",
            id=",".join(batch),
            maxResults=50,
        ).execute()
        items = response.get("items", [])
        found_ids = {item.get("id") for item in items}
        missing_ids = [video_id for video_id in batch if video_id not in found_ids]
        if missing_ids:
            print(
                (
                    "  Warning: {count} videos were not returned by the API in this batch: {ids}".format(
                        count=len(missing_ids), ids=", ".join(missing_ids)
                    )
                ),
                file=sys.stderr,
            )
        for item in items:
            records.append(video_item_to_record(item))
        if (start // 50 + 1) % 10 == 0:
            print(f"  Processed metadata batches up to video index {start + len(batch)}")
    return records


def determine_output_path(user_path: str | None) -> Path:
    if user_path:
        return Path(user_path)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    return DATA_DIR / f"video_data_{timestamp}.csv"


def main() -> int:
    args = parse_args()
    output_path = determine_output_path(args.output)

    credentials = get_credentials(CLIENT_SECRETS_FILE, TOKEN_FILE, SCOPES)
    youtube = build("youtube", "v3", credentials=credentials)

    video_ids, _ = list_channel_video_ids(youtube)
    if not video_ids:
        print("No uploads found for this channel.")
        return 1
    print(f"Found {len(video_ids)} uploads. Fetching video metadata...")

    try:
        records = fetch_video_metadata(youtube, video_ids)
    except HttpError as error:
        print(f"Request failed: {error}", file=sys.stderr)
        return 1

    if not records:
        print("No metadata records were returned.")
        return 1

    df = pd.DataFrame(records)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Saved {len(df)} metadata rows to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
