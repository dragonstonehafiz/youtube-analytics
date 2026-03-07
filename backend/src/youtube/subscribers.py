from __future__ import annotations

from typing import Iterable

from googleapiclient.errors import HttpError

from src.youtube.client import get_youtube_client


def iter_public_subscribers(page_size: int = 50) -> Iterable[dict]:
    """Yield public subscribers for the authenticated channel."""
    youtube = get_youtube_client()
    page_token = None
    while True:
        response = youtube.subscriptions().list(
            part="snippet,subscriberSnippet",
            mySubscribers=True,
            maxResults=page_size,
            pageToken=page_token,
        ).execute()
        for item in response.get("items", []):
            yield item
        page_token = response.get("nextPageToken")
        if not page_token:
            break


def extract_public_subscribers() -> tuple[list[dict], int]:
    """Return normalized public-subscriber rows for audience persistence and API call count.

    Returns:
        Tuple of (rows list, api_calls made)
    """
    rows: list[dict] = []
    api_calls = 0
    try:
        youtube = get_youtube_client()
        page_token = None
        while True:
            response = youtube.subscriptions().list(
                part="snippet,subscriberSnippet",
                mySubscribers=True,
                maxResults=50,
                pageToken=page_token,
            ).execute()
            api_calls += 1

            for item in response.get("items", []):
                subscriber_snippet = item.get("subscriberSnippet", {})
                subscription_snippet = item.get("snippet", {})
                channel_id = str(subscriber_snippet.get("channelId") or "").strip()
                if not channel_id:
                    continue
                thumbnails = subscriber_snippet.get("thumbnails", {}) or {}
                profile_image_url = (
                    (thumbnails.get("high") or {}).get("url")
                    or (thumbnails.get("medium") or {}).get("url")
                    or (thumbnails.get("default") or {}).get("url")
                )
                rows.append(
                    {
                        "channel_id": channel_id,
                        "display_name": subscriber_snippet.get("title"),
                        "profile_image_url": profile_image_url,
                        "is_public_subscriber": 1,
                        "subscribed_at": subscription_snippet.get("publishedAt"),
                    }
                )

            page_token = response.get("nextPageToken")
            if not page_token:
                break
    except HttpError as exc:
        raise RuntimeError(f"YouTube API error: {exc}") from exc
    return rows, api_calls
