from __future__ import annotations

from typing import Iterable

from googleapiclient.errors import HttpError

from src.youtube.client import get_youtube_client


def iter_playlists(page_size: int = 50) -> Iterable[dict]:
    """Yield all playlists owned by the authenticated channel."""
    youtube = get_youtube_client()
    page_token = None
    while True:
        response = youtube.playlists().list(
            part="id,snippet,contentDetails,status",
            mine=True,
            maxResults=page_size,
            pageToken=page_token,
        ).execute()
        for item in response.get("items", []):
            yield item
        page_token = response.get("nextPageToken")
        if not page_token:
            break


def get_all_playlists(page_size: int = 50) -> tuple[list[dict], int]:
    """Return all playlists owned by the authenticated channel and API call count.

    Returns:
        Tuple of (playlists list, api_calls made)
    """
    youtube = get_youtube_client()
    page_token = None
    playlists: list[dict] = []
    api_calls = 0
    while True:
        response = youtube.playlists().list(
            part="id,snippet,contentDetails,status",
            mine=True,
            maxResults=page_size,
            pageToken=page_token,
        ).execute()
        api_calls += 1
        for item in response.get("items", []):
            playlists.append(item)
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return playlists, api_calls


def iter_playlist_items(playlist_id: str, page_size: int = 50) -> Iterable[dict]:
    """Yield all items for a given playlist ID."""
    youtube = get_youtube_client()
    page_token = None
    while True:
        response = youtube.playlistItems().list(
            part="id,snippet,contentDetails,status",
            playlistId=playlist_id,
            maxResults=page_size,
            pageToken=page_token,
        ).execute()
        for item in response.get("items", []):
            yield item
        page_token = response.get("nextPageToken")
        if not page_token:
            break


def get_all_playlist_items(playlist_id: str, page_size: int = 50) -> tuple[list[dict], int]:
    """Return all playlist items for a playlist ID and API call count.

    Returns:
        Tuple of (items list, api_calls made)
    """
    youtube = get_youtube_client()
    page_token = None
    items: list[dict] = []
    api_calls = 0
    while True:
        response = youtube.playlistItems().list(
            part="id,snippet,contentDetails,status",
            playlistId=playlist_id,
            maxResults=page_size,
            pageToken=page_token,
        ).execute()
        api_calls += 1
        for item in response.get("items", []):
            items.append(item)
        page_token = response.get("nextPageToken")
        if not page_token:
            break
    return items, api_calls


def fetch_all_playlists_with_items(page_size: int = 50) -> tuple[list[dict], int]:
    """Return playlists with nested `items` arrays and API call count.

    Returns:
        Tuple of (playlists list, total api_calls made)
    """
    playlists, api_calls = get_all_playlists(page_size=page_size)
    for playlist in playlists:
        playlist_id = playlist.get("id")
        playlist["items"] = []
        if playlist_id:
            items, item_api_calls = get_all_playlist_items(playlist_id=playlist_id, page_size=page_size)
            playlist["items"] = items
            api_calls += item_api_calls
    return playlists, api_calls


def safe_fetch_all_playlists_with_items(page_size: int = 50) -> tuple[list[dict], int]:
    """Return playlists + items and API call count or raise RuntimeError on YouTube API failure.

    Returns:
        Tuple of (playlists list, total api_calls made)
    """
    try:
        return fetch_all_playlists_with_items(page_size=page_size)
    except HttpError as exc:
        raise RuntimeError(f"YouTube API error: {exc}") from exc

