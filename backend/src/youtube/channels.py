"""YouTube API channel helpers."""

from __future__ import annotations

from googleapiclient.errors import HttpError

from .client import get_youtube_client


def get_authenticated_channel_info() -> dict:
    """Fetch authenticated user's full channel metadata.

    Returns:
        Dictionary with channel metadata including channel_id, label, thumbnail_url, video_count, etc.
    """
    youtube = get_youtube_client()
    try:
        # Get authenticated channel ID
        response = youtube.channels().list(part="snippet,statistics,contentDetails,topicDetails,status", mine=True, maxResults=1).execute()
        if not response.get("items"):
            raise ValueError("No authenticated channel found")

        channel = response["items"][0]
        channel_id = channel.get("id")
        snippet = channel.get("snippet", {})
        statistics = channel.get("statistics", {})
        content_details = channel.get("contentDetails", {})
        uploads = content_details.get("relatedPlaylists", {})
        topic_details = channel.get("topicDetails", {})
        status = channel.get("status", {})

        # Parse thumbnail URL (prefer medium or default)
        thumbnail_url = None
        thumbnails = snippet.get("thumbnails", {})
        if thumbnails.get("medium"):
            thumbnail_url = thumbnails["medium"].get("url")
        elif thumbnails.get("default"):
            thumbnail_url = thumbnails["default"].get("url")

        return {
            "channel_id": channel_id,
            "label": snippet.get("title", ""),
            "description": snippet.get("description", ""),
            "custom_url": snippet.get("customUrl"),
            "thumbnail_url": thumbnail_url,
            "video_count": int(statistics.get("videoCount", 0)),
            "subscriber_count": int(statistics.get("subscriberCount", 0)) if statistics.get("subscriberCount") else None,
            "hidden_subscriber_count": statistics.get("hiddenSubscriberCount", False),
            "view_count": int(statistics.get("viewCount", 0)) if statistics.get("viewCount") else None,
            "uploads_playlist_id": uploads.get("uploads"),
            "topic_ids": topic_details.get("topicIds", []),
            "topic_categories": topic_details.get("topicCategories", []),
            "privacy_status": status.get("privacyStatus"),
            "is_linked": status.get("isLinked"),
            "long_uploads_status": status.get("longUploadsStatus"),
            "made_for_kids": status.get("madeForKids"),
            "is_own": 1,
        }
    except HttpError as exc:
        raise RuntimeError(f"YouTube API error: {exc}") from exc


def get_channel_info(channel_id: str) -> dict:
    """Fetch full channel metadata from YouTube API.

    Args:
        channel_id: The YouTube channel ID

    Returns:
        Dictionary with channel metadata including snippet, statistics, contentDetails, etc.
    """
    youtube = get_youtube_client()
    response = youtube.channels().list(
        part="snippet,statistics,contentDetails,topicDetails,status",
        id=channel_id,
    ).execute()

    if not response.get("items"):
        raise ValueError(f"Channel {channel_id} not found")

    channel = response["items"][0]
    snippet = channel.get("snippet", {})
    statistics = channel.get("statistics", {})
    content_details = channel.get("contentDetails", {})
    uploads = content_details.get("relatedPlaylists", {})
    topic_details = channel.get("topicDetails", {})
    status = channel.get("status", {})

    # Parse thumbnail URL (prefer medium or default)
    thumbnail_url = None
    thumbnails = snippet.get("thumbnails", {})
    if thumbnails.get("medium"):
        thumbnail_url = thumbnails["medium"].get("url")
    elif thumbnails.get("default"):
        thumbnail_url = thumbnails["default"].get("url")

    return {
        "channel_id": channel_id,
        "label": snippet.get("title", ""),
        "description": snippet.get("description", ""),
        "custom_url": snippet.get("customUrl"),
        "thumbnail_url": thumbnail_url,
        "video_count": int(statistics.get("videoCount", 0)),
        "subscriber_count": int(statistics.get("subscriberCount", 0)) if statistics.get("subscriberCount") else None,
        "hidden_subscriber_count": statistics.get("hiddenSubscriberCount", False),
        "view_count": int(statistics.get("viewCount", 0)) if statistics.get("viewCount") else None,
        "uploads_playlist_id": uploads.get("uploads"),
        "topic_ids": topic_details.get("topicIds", []),
        "topic_categories": topic_details.get("topicCategories", []),
        "privacy_status": status.get("privacyStatus"),
        "is_linked": status.get("isLinked"),
        "long_uploads_status": status.get("longUploadsStatus"),
        "made_for_kids": status.get("madeForKids"),
    }
