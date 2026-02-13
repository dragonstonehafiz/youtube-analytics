from __future__ import annotations

from src.database.db import get_connection


def upsert_comments(rows: list[dict]) -> int:
    """Insert or update comment rows."""
    if not rows:
        return 0
    with get_connection() as conn:
        comment_columns = {str(row["name"]) for row in conn.execute("PRAGMA table_info('comments')").fetchall()}
    has_updated_at = "updated_at" in comment_columns
    values = []
    for row in rows:
        base_values = (
            row.get("id"),
            row.get("video_id"),
            row.get("reply_count"),
            row.get("author_name"),
            row.get("author_channel_id"),
            row.get("author_profile_image_url"),
            row.get("text_display"),
            row.get("like_count"),
            row.get("published_at"),
        )
        if has_updated_at:
            values.append(base_values + (row.get("updated_at"),))
        else:
            values.append(base_values)
    if has_updated_at:
        sql = """
            INSERT INTO comments (
                id, video_id, reply_count, author_name, author_channel_id,
                author_profile_image_url, text_display, like_count, published_at, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            ON CONFLICT(id) DO UPDATE SET
                video_id=excluded.video_id,
                reply_count=excluded.reply_count,
                author_name=excluded.author_name,
                author_channel_id=excluded.author_channel_id,
                author_profile_image_url=excluded.author_profile_image_url,
                text_display=excluded.text_display,
                like_count=excluded.like_count,
                published_at=excluded.published_at,
                updated_at=excluded.updated_at
        """
    else:
        sql = """
            INSERT INTO comments (
                id, video_id, reply_count, author_name, author_channel_id,
                author_profile_image_url, text_display, like_count, published_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            ON CONFLICT(id) DO UPDATE SET
                video_id=excluded.video_id,
                reply_count=excluded.reply_count,
                author_name=excluded.author_name,
                author_channel_id=excluded.author_channel_id,
                author_profile_image_url=excluded.author_profile_image_url,
                text_display=excluded.text_display,
                like_count=excluded.like_count,
                published_at=excluded.published_at
        """
    with get_connection() as conn:
        conn.executemany(sql, values)
        conn.commit()
    return len(values)
