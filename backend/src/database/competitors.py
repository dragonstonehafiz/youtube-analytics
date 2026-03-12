from __future__ import annotations

from src.database.db import get_connection
from src.youtube.videos import parse_duration_to_seconds


def upsert_competitor_videos(items: list[dict], short_video_ids: set[str] | None = None) -> int:
    """Insert or update competitor video rows and return the number of rows processed."""
    if not items:
        return 0
    short_ids = short_video_ids or set()

    rows = []
    for item in items:
        snippet = item.get("snippet", {})
        content = item.get("contentDetails", {})
        stats = item.get("statistics", {})
        status = item.get("status", {})
        duration_seconds = parse_duration_to_seconds(content.get("duration"))
        content_type = "short" if item.get("id") in short_ids else "video"

        rows.append((
            item["id"],
            snippet.get("title"),
            snippet.get("description"),
            snippet.get("publishedAt"),
            snippet.get("channelId"),
            snippet.get("channelTitle"),
            status.get("privacyStatus"),
            1 if status.get("madeForKids") else 0 if status.get("madeForKids") is not None else None,
            duration_seconds,
            int(stats["viewCount"]) if "viewCount" in stats else None,
            int(stats["likeCount"]) if "likeCount" in stats else None,
            int(stats["commentCount"]) if "commentCount" in stats else None,
            int(stats["favoriteCount"]) if "favoriteCount" in stats else None,
            snippet.get("thumbnails", {}).get("high", {}).get("url"),
            content_type,
        ))

    sql = """
        INSERT INTO videos_competitors (
            id, title, description, published_at, channel_id, channel_title,
            privacy_status, made_for_kids, duration_seconds, view_count,
            like_count, comment_count, favorite_count, thumbnail_url,
            content_type
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
            title=excluded.title,
            description=excluded.description,
            published_at=excluded.published_at,
            channel_id=excluded.channel_id,
            channel_title=excluded.channel_title,
            privacy_status=excluded.privacy_status,
            made_for_kids=excluded.made_for_kids,
            duration_seconds=excluded.duration_seconds,
            view_count=excluded.view_count,
            like_count=excluded.like_count,
            comment_count=excluded.comment_count,
            favorite_count=excluded.favorite_count,
            thumbnail_url=excluded.thumbnail_url,
            content_type=excluded.content_type
    """

    with get_connection() as conn:
        conn.executemany(sql, rows)
        conn.commit()
    return len(rows)
