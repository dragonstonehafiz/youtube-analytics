#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
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
from utils.youtube import list_channel_playlists


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Export metadata for every playlist owned by the authenticated channel.")
    parser.add_argument(
        "--output",
        help="CSV destination. Defaults to data/playlist_data.csv (directory created if missing).",
    )
    return parser.parse_args()


def playlist_item_to_record(item: dict[str, Any]) -> dict[str, Any]:
    snippet = item.get("snippet", {})
    status = item.get("status", {})
    content_details = item.get("contentDetails", {})
    return {
        "playlist_id": item.get("id", ""),
        "title": snippet.get("title", ""),
        "description": snippet.get("description", ""),
        "published_at": snippet.get("publishedAt", ""),
        "channel_title": snippet.get("channelTitle", ""),
        "item_count": content_details.get("itemCount", ""),
        "privacy_status": status.get("privacyStatus", ""),
        "default_language": snippet.get("defaultLanguage", ""),
        "localized_title": (snippet.get("localized", {}) or {}).get("title", ""),
        "localized_description": (snippet.get("localized", {}) or {}).get("description", ""),
    }


def determine_output_path(user_path: str | None) -> Path:
    if user_path:
        return Path(user_path)
    return DATA_DIR / "playlist_data.csv"


def main() -> int:
    args = parse_args()
    output_path = determine_output_path(args.output)

    credentials = get_credentials(CLIENT_SECRETS_FILE, TOKEN_FILE, SCOPES)
    youtube = build("youtube", "v3", credentials=credentials)

    try:
        playlists = list_channel_playlists(youtube)
    except HttpError as error:
        print(f"Request failed: {error}", file=sys.stderr)
        return 1

    if not playlists:
        print("No playlists found for this channel.")
        return 1

    records = [playlist_item_to_record(item) for item in playlists]
    df = pd.DataFrame(records)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Saved {len(df)} playlist rows to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
