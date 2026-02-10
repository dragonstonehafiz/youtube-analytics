from __future__ import annotations

from datetime import datetime, timezone

from src.database.db import get_connection
from src.youtube.videos import parse_duration_to_seconds


def upsert_videos(items: list[dict], short_video_ids: set[str] | None = None) -> int:
    """Insert or update video rows and return the number of rows processed."""
    if not items:
        return 0
    short_ids = short_video_ids or set()

    now = datetime.now(timezone.utc).isoformat()
    rows = []
    for item in items:
        snippet = item.get("snippet", {})
        content = item.get("contentDetails", {})
        stats = item.get("statistics", {})
        status = item.get("status", {})
        file_details = item.get("fileDetails", {})
        video_streams = file_details.get("videoStreams", []) if isinstance(file_details, dict) else []
        stream = video_streams[0] if video_streams else {}
        width = stream.get("widthPixels")
        height = stream.get("heightPixels")
        duration_seconds = parse_duration_to_seconds(content.get("duration"))
        content_type = "short" if item.get("id") in short_ids else "video"

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
                duration_seconds,
                int(stats["viewCount"]) if "viewCount" in stats else None,
                int(stats["likeCount"]) if "likeCount" in stats else None,
                int(stats["commentCount"]) if "commentCount" in stats else None,
                int(stats["favoriteCount"]) if "favoriteCount" in stats else None,
                snippet.get("thumbnails", {}).get("high", {}).get("url"),
                width,
                height,
                content_type,
                now,
            )
        )

    sql = """
        INSERT INTO videos (
            id, title, description, published_at, channel_id, channel_title,
            privacy_status, made_for_kids, duration_seconds, view_count,
            like_count, comment_count, favorite_count, thumbnail_url,
            video_width, video_height, content_type, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
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
            video_width=excluded.video_width,
            video_height=excluded.video_height,
            content_type=excluded.content_type,
            updated_at=excluded.updated_at
    """

    with get_connection() as conn:
        conn.executemany(sql, rows)
        conn.commit()
    return len(rows)
