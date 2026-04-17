from __future__ import annotations

import re
from typing import Callable, Iterable

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


def _iter_playlist_video_ids(playlist_id: str, page_size: int = 50) -> Iterable[str]:
    """Yield video IDs from a specific playlist."""
    youtube = get_youtube_client()
    page_token = None
    while True:
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


def get_short_video_ids(uploads_playlist_id: str) -> tuple[set[str], int]:
    """Return short-video IDs from the UUSH-derived shorts playlist and API call count.

    Args:
        uploads_playlist_id: The uploads playlist ID for a channel

    Returns:
        Tuple of (short video IDs set, api_calls made)
    """
    api_calls = 0
    if not uploads_playlist_id.startswith("UU"):
        return set(), api_calls
    shorts_playlist_id = f"UUSH{uploads_playlist_id[2:]}"
    youtube = get_youtube_client()
    page_token = None
    video_ids: set[str] = set()
    while True:
        try:
            response = youtube.playlistItems().list(
                part="contentDetails",
                playlistId=shorts_playlist_id,
                maxResults=50,
                pageToken=page_token,
            ).execute()
        except HttpError as exc:
            if exc.resp.status == 404:
                # Shorts playlist doesn't exist for this channel
                return video_ids, api_calls
            raise
        api_calls += 1
        for item in response.get("items", []):
            video_id = item["contentDetails"]["videoId"]
            if video_id:
                video_ids.add(video_id)
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return video_ids, api_calls


def fetch_video_details(video_ids: list[str]) -> tuple[list[dict], int]:
    """Fetch full video details for a list of video IDs and API call count.

    Returns:
        Tuple of (video details list, api_calls made)
    """
    if not video_ids:
        return [], 0
    youtube = get_youtube_client()
    # The videos endpoint accepts up to 50 IDs per request.
    response = youtube.videos().list(
        part="snippet,contentDetails,statistics,status",
        id=",".join(video_ids),
        maxResults=50,
    ).execute()
    return response.get("items", []), 1


def get_all_videos(uploads_playlist_id: str, on_batch: Callable[[list[dict]], None] | None = None, on_progress: Callable[[], None] | None = None) -> int:
    """Fetch and upsert all uploaded videos. Returns API call count.

    Args:
        uploads_playlist_id: The uploads playlist ID for a channel
        on_batch: Optional callback(videos) called after each batch is fetched
        on_progress: Optional callback() called after each video details batch fetch

    Returns:
        Total API calls made
    """
    # 1) Gather all upload video IDs (with pagination), 2) fetch details in 50-id batches.
    api_calls = 0
    youtube = get_youtube_client()
    page_token = None
    video_ids: list[str] = []
    while True:
        response = youtube.playlistItems().list(
            part="contentDetails",
            playlistId=uploads_playlist_id,
            maxResults=50,
            pageToken=page_token,
        ).execute()
        api_calls += 1
        items = response.get("items", [])
        for item in items:
            video_ids.append(item["contentDetails"]["videoId"])
        page_token = response.get("nextPageToken")
        if not page_token:
            break

    for i in range(0, len(video_ids), 50):
        batch = video_ids[i : i + 50]
        batch_videos, batch_calls = fetch_video_details(batch)
        api_calls += batch_calls
        if on_batch:
            on_batch(batch_videos)
        if on_progress:
            on_progress()
    return api_calls


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


def get_channel_uploads_playlist_id(channel_id: str) -> str:
    """Return the uploads playlist ID for a specific channel."""
    youtube = get_youtube_client()
    response = youtube.channels().list(part="contentDetails", id=channel_id, maxResults=1).execute()
    items = response.get("items", [])
    if not items:
        raise RuntimeError(f"Channel {channel_id} not found or not accessible.")
    return items[0]["contentDetails"]["relatedPlaylists"]["uploads"]
