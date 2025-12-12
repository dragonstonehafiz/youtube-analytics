from __future__ import annotations

from datetime import date
from typing import Any, Sequence


def list_channel_video_ids(youtube_service: Any) -> tuple[list[str], str | None]:
    channels_response = youtube_service.channels().list(part="contentDetails", mine=True).execute()
    items = channels_response.get("items", [])
    if not items:
        return [], None
    uploads_playlist = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]
    video_ids: list[str] = []
    earliest_upload: date | None = None
    next_page_token: str | None = None
    while True:
        playlist_response = youtube_service.playlistItems().list(
            part="contentDetails",
            playlistId=uploads_playlist,
            maxResults=50,
            pageToken=next_page_token,
        ).execute()
        for item in playlist_response.get("items", []):
            video_ids.append(item["contentDetails"]["videoId"])
            published_at = item["contentDetails"].get("videoPublishedAt")
            if published_at:
                published_date = published_at.split("T", 1)[0]
                try:
                    published = date.fromisoformat(published_date)
                except ValueError:
                    continue
                if earliest_upload is None or published < earliest_upload:
                    earliest_upload = published
        next_page_token = playlist_response.get("nextPageToken")
        if not next_page_token:
            break
    earliest_str = earliest_upload.isoformat() if earliest_upload else None
    return video_ids, earliest_str


def list_channel_playlists(youtube_service: Any, parts: Sequence[str] | None = None) -> list[dict[str, Any]]:
    requested_parts = ",".join(parts) if parts else "snippet,contentDetails,status"
    playlists: list[dict[str, Any]] = []
    next_page_token: str | None = None
    while True:
        response = (
            youtube_service.playlists()
            .list(
                part=requested_parts,
                mine=True,
                maxResults=50,
                pageToken=next_page_token,
            )
            .execute()
        )
        playlists.extend(response.get("items", []))
        next_page_token = response.get("nextPageToken")
        if not next_page_token:
            break
    return playlists


def list_playlist_items(youtube_service: Any, playlist_id: str, parts: Sequence[str] | None = None) -> list[dict[str, Any]]:
    requested_parts = ",".join(parts) if parts else "contentDetails,snippet"
    items: list[dict[str, Any]] = []
    next_page_token: str | None = None
    while True:
        response = (
            youtube_service.playlistItems()
            .list(
                part=requested_parts,
                playlistId=playlist_id,
                maxResults=50,
                pageToken=next_page_token,
            )
            .execute()
        )
        items.extend(response.get("items", []))
        next_page_token = response.get("nextPageToken")
        if not next_page_token:
            break
    return items
