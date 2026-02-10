from __future__ import annotations

from typing import Iterable

from googleapiclient.errors import HttpError

from src.youtube.client import get_youtube_client


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


def extract_comments(video_id: str) -> list[dict]:
    """Return top-level comments for a video with reply counts (no reply-body pagination)."""
    comments: list[dict] = []
    try:
        for thread in iter_comment_threads(video_id):
            top = thread.get("snippet", {}).get("topLevelComment", {})
            thread_snippet = thread.get("snippet", {})
            total_reply_count = int(thread_snippet.get("totalReplyCount") or 0)
            comments.append(_comment_to_row(video_id, top, reply_count=total_reply_count))
    except HttpError as exc:
        error_text = ""
        try:
            if exc.content:
                error_text = exc.content.decode("utf-8")
        except Exception:
            error_text = str(exc)
        if "commentsDisabled" in error_text:
            return []
        raise RuntimeError(f"YouTube API error: {exc}") from exc
    return [row for row in comments if row.get("id")]


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

