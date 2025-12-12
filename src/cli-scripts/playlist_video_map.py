#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from pathlib import Path
from typing import Any

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

import pandas as pd
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from utils.auth import get_credentials
from utils.config import CLIENT_SECRETS_FILE, DATA_DIR, SCOPES, TOKEN_FILE
from utils.youtube import list_channel_playlists, list_playlist_items


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export playlist-to-video mappings for every playlist owned by the authenticated channel."
    )
    parser.add_argument(
        "--output",
        help="CSV destination. Defaults to data/playlist_video_map.csv (directory created if missing).",
    )
    return parser.parse_args()


def determine_output_path(user_path: str | None) -> Path:
    if user_path:
        return Path(user_path)
    return DATA_DIR / "playlist_video_map.csv"


def playlist_rows_for_channel(youtube_service) -> list[dict[str, Any]]:
    playlists = list_channel_playlists(youtube_service)
    if not playlists:
        return []
    rows: list[dict[str, Any]] = []
    for index, playlist in enumerate(playlists, start=1):
        playlist_id = playlist.get("id", "")
        playlist_title = (playlist.get("snippet", {}) or {}).get("title", "")
        playlist_items = list_playlist_items(youtube_service, playlist_id)
        for item in playlist_items:
            snippet = item.get("snippet", {})
            content_details = item.get("contentDetails", {})
            rows.append(
                {
                    "playlist_id": playlist_id,
                    "playlist_title": playlist_title,
                    "playlist_item_id": item.get("id", ""),
                    "playlist_position": snippet.get("position", ""),
                    "playlist_item_published_at": snippet.get("publishedAt", ""),
                    "video_id": content_details.get("videoId", ""),
                    "video_published_at": content_details.get("videoPublishedAt", ""),
                }
            )
        if index % 10 == 0:
            print(f"  Processed {index} playlists so far...")
    return rows


def main() -> int:
    args = parse_args()
    output_path = determine_output_path(args.output)

    credentials = get_credentials(CLIENT_SECRETS_FILE, TOKEN_FILE, SCOPES)
    youtube = build("youtube", "v3", credentials=credentials)

    try:
        rows = playlist_rows_for_channel(youtube)
    except HttpError as error:
        print(f"Request failed: {error}", file=sys.stderr)
        return 1

    if not rows:
        print("No playlist/video relationships found for this channel.")
        return 1

    df = pd.DataFrame(rows)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    df.to_csv(output_path, index=False)
    print(f"Saved {len(df)} playlist/video rows to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
