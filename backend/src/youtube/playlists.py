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


def get_all_playlists(page_size: int = 50) -> list[dict]:
    """Return all playlists owned by the authenticated channel."""
    return list(iter_playlists(page_size=page_size))


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


def get_all_playlist_items(playlist_id: str, page_size: int = 50) -> list[dict]:
    """Return all playlist items for a playlist ID."""
    return list(iter_playlist_items(playlist_id=playlist_id, page_size=page_size))


def fetch_all_playlists_with_items(page_size: int = 50) -> list[dict]:
    """Return playlists with nested `items` arrays containing all playlist items."""
    playlists = get_all_playlists(page_size=page_size)
    for playlist in playlists:
        playlist_id = playlist.get("id")
        playlist["items"] = []
        if playlist_id:
            playlist["items"] = get_all_playlist_items(playlist_id=playlist_id, page_size=page_size)
    return playlists


def safe_fetch_all_playlists_with_items(page_size: int = 50) -> list[dict]:
    """Return playlists + items or raise RuntimeError on YouTube API failure."""
    try:
        return fetch_all_playlists_with_items(page_size=page_size)
    except HttpError as exc:
        raise RuntimeError(f"YouTube API error: {exc}") from exc

