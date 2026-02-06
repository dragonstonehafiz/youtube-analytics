from __future__ import annotations

from typing import Iterable

from googleapiclient.errors import HttpError

from src.youtube.client import get_youtube_client


def iter_comment_threads(video_id: str, page_size: int = 100) -> Iterable[dict]:
    """Yield comment threads for a video."""
    youtube = get_youtube_client()
    page_token = None
    while True:
        response = youtube.commentThreads().list(
            part="snippet,replies",
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
    """Return flattened comments for a video (top-level + replies)."""
    comments: list[dict] = []
    try:
        for thread in iter_comment_threads(video_id):
            top = thread.get("snippet", {}).get("topLevelComment", {})
            comments.append(_comment_to_row(video_id, top, parent_id=None))
            replies = thread.get("replies", {}).get("comments", [])
            for reply in replies:
                comments.append(_comment_to_row(video_id, reply, parent_id=top.get("id")))
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


def _comment_to_row(video_id: str, comment: dict, parent_id: str | None) -> dict:
    snippet = comment.get("snippet", {})
    return {
        "id": comment.get("id"),
        "video_id": video_id,
        "parent_id": parent_id,
        "author_name": snippet.get("authorDisplayName"),
        "author_channel_id": snippet.get("authorChannelId", {}).get("value"),
        "text_display": snippet.get("textDisplay"),
        "like_count": snippet.get("likeCount"),
        "published_at": snippet.get("publishedAt"),
        "updated_at": snippet.get("updatedAt"),
    }
