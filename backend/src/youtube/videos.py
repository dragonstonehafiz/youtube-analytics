from __future__ import annotations

import re
from typing import Iterable

from googleapiclient.errors import HttpError

from src.youtube.client import get_youtube_client


_DURATION_RE = re.compile(
    r"^PT(?:(?P<hours>\d+)H)?(?:(?P<minutes>\d+)M)?(?:(?P<seconds>\d+)S)?$"
)


def parse_duration_to_seconds(value: str | None) -> int | None:
    """Convert an ISO 8601 duration string (e.g., PT1H2M3S) into seconds."""
    if not value:
        return None
    match = _DURATION_RE.match(value)
    if not match:
        return None
    hours = int(match.group("hours") or 0)
    minutes = int(match.group("minutes") or 0)
    seconds = int(match.group("seconds") or 0)
    return hours * 3600 + minutes * 60 + seconds


def get_uploads_playlist_id() -> str:
    """Return the uploads playlist ID for the authenticated channel."""
    youtube = get_youtube_client()
    # "uploads" playlist contains every video uploaded by the channel.
    response = youtube.channels().list(part="contentDetails", mine=True, maxResults=1).execute()
    items = response.get("items", [])
    if not items:
        raise RuntimeError("No channel found for the authenticated user.")
    return items[0]["contentDetails"]["relatedPlaylists"]["uploads"]


def iter_upload_video_ids(page_size: int = 50) -> Iterable[str]:
    """Yield all uploaded video IDs for the authenticated channel."""
    youtube = get_youtube_client()
    playlist_id = get_uploads_playlist_id()
    page_token = None

    while True:
        # Page through playlist items to collect every upload.
        response = youtube.playlistItems().list(
            part="contentDetails",
            playlistId=playlist_id,
            maxResults=page_size,
            pageToken=page_token,
        ).execute()
        for item in response.get("items", []):
            yield item["contentDetails"]["videoId"]
        page_token = response.get("nextPageToken")
        if not page_token:
            break


def fetch_video_details(video_ids: list[str]) -> list[dict]:
    """Fetch full video details for a list of video IDs."""
    if not video_ids:
        return []
    youtube = get_youtube_client()
    # The videos endpoint accepts up to 50 IDs per request.
    response = youtube.videos().list(
        part="snippet,contentDetails,statistics,status",
        id=",".join(video_ids),
        maxResults=50,
    ).execute()
    return response.get("items", [])


def get_all_videos() -> list[dict]:
    """Return full metadata for every uploaded video."""
    # 1) Gather all upload video IDs, 2) fetch details in 50-id batches.
    video_ids = list(iter_upload_video_ids())
    videos: list[dict] = []
    for i in range(0, len(video_ids), 50):
        batch = video_ids[i : i + 50]
        videos.extend(fetch_video_details(batch))
    return videos


def safe_get_videos() -> list[dict]:
    """Return all videos or raise a RuntimeError on API failure."""
    try:
        return get_all_videos()
    except HttpError as exc:
        raise RuntimeError(f"YouTube API error: {exc}") from exc


def get_channel_info() -> dict:
    """Return the authenticated channel's metadata and statistics."""
    youtube = get_youtube_client()
    try:
        # Fetch the authenticated channel's public metadata + stats.
        response = youtube.channels().list(part="snippet,statistics", mine=True, maxResults=1).execute()
    except HttpError as exc:
        raise RuntimeError(f"YouTube API error: {exc}") from exc
    items = response.get("items", [])
    if not items:
        raise RuntimeError("No channel found for the authenticated user.")
    return items[0]
