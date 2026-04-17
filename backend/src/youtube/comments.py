from __future__ import annotations

from typing import Iterable

from googleapiclient.errors import HttpError

from src.youtube.client import get_youtube_client
from src.utils.logger import get_logger

logger = get_logger(__name__)


def iter_comment_threads(video_id: str, page_size: int = 100) -> Iterable[dict]:
    """Yield top-level comment threads for a video."""
    youtube = get_youtube_client()
    page_token = None
    while True:
        response = youtube.commentThreads().list(
            part="snippet",
            videoId=video_id,
            maxResults=page_size,
            pageToken=page_token,
            textFormat="plainText",
        ).execute()
        for item in response.get("items", []):
            yield item
        page_token = response.get("nextPageToken")
        if not page_token:
            break


def extract_comments(video_id: str) -> tuple[list[dict], int]:
    """Return top-level comments for a video with reply counts and API call count.

    Returns:
        Tuple of (comments list, api_calls made)
    """
    comments: list[dict] = []
    api_calls = 0
    try:
        youtube = get_youtube_client()
        page_token = None
        while True:
            response = youtube.commentThreads().list(
                part="snippet",
                videoId=video_id,
                maxResults=100,
                pageToken=page_token,
                textFormat="plainText",
            ).execute()
            api_calls += 1

            for thread in response.get("items", []):
                top = thread.get("snippet", {}).get("topLevelComment", {})
                thread_snippet = thread.get("snippet", {})
                total_reply_count = int(thread_snippet.get("totalReplyCount") or 0)
                comments.append(_comment_to_row(video_id, top, reply_count=total_reply_count))

            page_token = response.get("nextPageToken")
            if not page_token:
                break
    except HttpError as exc:
        error_text = ""
        try:
            if exc.content:
                error_text = exc.content.decode("utf-8")
        except Exception:
            error_text = str(exc)
        # Skip videos where comments cannot be fetched (disabled, live streams, processing failures, deleted videos, etc.)
        if any(keyword in error_text for keyword in ["commentsDisabled", "processingFailure", "forbidden", "disabled", "videoNotFound"]):
            logger.warning(f"Skipping comments for video {video_id}")
            return [], 0
        raise RuntimeError(f"YouTube API error: {exc}") from exc
    return [row for row in comments if row.get("id")], api_calls


def _comment_to_row(video_id: str, comment: dict, reply_count: int | None = None) -> dict:
    snippet = comment.get("snippet", {})
    return {
        "id": comment.get("id"),
        "video_id": video_id,
        "reply_count": int(reply_count or 0),
        "author_name": snippet.get("authorDisplayName"),
        "author_channel_id": snippet.get("authorChannelId", {}).get("value"),
        "author_profile_image_url": snippet.get("authorProfileImageUrl"),
        "text_display": snippet.get("textDisplay"),
        "like_count": snippet.get("likeCount"),
        "published_at": snippet.get("publishedAt"),
        "updated_at": snippet.get("updatedAt"),
    }

