from __future__ import annotations

from datetime import date
from typing import Any


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
