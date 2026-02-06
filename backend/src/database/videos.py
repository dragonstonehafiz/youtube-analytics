from __future__ import annotations

from datetime import datetime, timezone

from src.database.db import get_connection
from src.youtube.videos import parse_duration_to_seconds


def upsert_videos(items: list[dict]) -> int:
    """Insert or update video rows and return the number of rows processed."""
    if not items:
        return 0

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for item in items:
        snippet = item.get("snippet", {})
        content = item.get("contentDetails", {})
        stats = item.get("statistics", {})
        status = item.get("status", {})

        rows.append(
            (
                item["id"],
                snippet.get("title"),
                snippet.get("description"),
                snippet.get("publishedAt"),
                snippet.get("channelId"),
                snippet.get("channelTitle"),
                status.get("privacyStatus"),
                1 if status.get("madeForKids") else 0 if status.get("madeForKids") is not None else None,
                parse_duration_to_seconds(content.get("duration")),
                int(stats["viewCount"]) if "viewCount" in stats else None,
                int(stats["likeCount"]) if "likeCount" in stats else None,
                int(stats["commentCount"]) if "commentCount" in stats else None,
                int(stats["favoriteCount"]) if "favoriteCount" in stats else None,
                snippet.get("thumbnails", {}).get("high", {}).get("url"),
                now,
            )
        )

    sql = """
        INSERT INTO videos (
            id, title, description, published_at, channel_id, channel_title,
            privacy_status, made_for_kids, duration_seconds, view_count,
            like_count, comment_count, favorite_count, thumbnail_url, updated_at
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
            updated_at=excluded.updated_at
    """

    with get_connection() as conn:
        conn.executemany(sql, rows)
        conn.commit()
    return len(rows)
