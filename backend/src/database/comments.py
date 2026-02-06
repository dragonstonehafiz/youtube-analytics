from __future__ import annotations

from src.database.db import get_connection


def upsert_comments(rows: list[dict]) -> int:
    """Insert or update comment rows."""
    if not rows:
        return 0
    values = []
    for row in rows:
        values.append(
            (
                row.get("id"),
                row.get("video_id"),
                row.get("parent_id"),
                row.get("author_name"),
                row.get("author_channel_id"),
                row.get("text_display"),
                row.get("like_count"),
                row.get("published_at"),
                row.get("updated_at"),
            )
        )
    sql = """
        INSERT INTO comments (
            id, video_id, parent_id, author_name, author_channel_id,
            text_display, like_count, published_at, updated_at
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(id) DO UPDATE SET
            video_id=excluded.video_id,
            parent_id=excluded.parent_id,
            author_name=excluded.author_name,
            author_channel_id=excluded.author_channel_id,
            text_display=excluded.text_display,
            like_count=excluded.like_count,
            published_at=excluded.published_at,
            updated_at=excluded.updated_at
    """
    with get_connection() as conn:
        conn.executemany(sql, values)
        conn.commit()
    return len(values)
