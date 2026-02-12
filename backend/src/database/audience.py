from __future__ import annotations

from src.database.db import get_connection


def upsert_audience(rows: list[dict]) -> int:
    """Insert or update audience rows from public subscribers data."""
    if not rows:
        return 0
    values = []
    for row in rows:
        channel_id = str(row.get("channel_id") or "").strip()
        if not channel_id:
            continue
        values.append(
            (
                channel_id,
                row.get("display_name"),
                row.get("profile_image_url"),
                int(1 if row.get("is_public_subscriber") else 0),
                row.get("subscribed_at"),
            )
        )
    if not values:
        return 0
    sql = """
        INSERT INTO audience (
            channel_id, display_name, profile_image_url, is_public_subscriber, subscribed_at
        ) VALUES (
            ?, ?, ?, ?, ?
        )
        ON CONFLICT(channel_id) DO UPDATE SET
            display_name=COALESCE(excluded.display_name, audience.display_name),
            profile_image_url=COALESCE(excluded.profile_image_url, audience.profile_image_url),
            is_public_subscriber=MAX(audience.is_public_subscriber, excluded.is_public_subscriber),
            subscribed_at=COALESCE(excluded.subscribed_at, audience.subscribed_at)
    """
    with get_connection() as conn:
        conn.executemany(sql, values)
        conn.commit()
    return len(values)


def upsert_commenters_from_comments() -> int:
    """Upsert audience rows for commenters not already known from subscriber sync."""
    with get_connection() as conn:
        before_row = conn.execute("SELECT COUNT(*) AS count FROM audience").fetchone()
        conn.execute(
            """
            INSERT INTO audience (
                channel_id,
                display_name,
                profile_image_url,
                is_public_subscriber,
                subscribed_at,
                first_commented_at,
                last_commented_at,
                comment_count
            )
            SELECT
                c.author_channel_id AS channel_id,
                MAX(COALESCE(c.author_name, '')) AS display_name,
                MAX(COALESCE(c.author_profile_image_url, '')) AS profile_image_url,
                0 AS is_public_subscriber,
                NULL AS subscribed_at,
                MIN(c.published_at) AS first_commented_at,
                MAX(c.published_at) AS last_commented_at,
                COUNT(*) AS comment_count
            FROM comments c
            WHERE c.author_channel_id IS NOT NULL AND c.author_channel_id != ''
            GROUP BY c.author_channel_id
            ON CONFLICT(channel_id) DO UPDATE SET
                display_name=COALESCE(NULLIF(excluded.display_name, ''), audience.display_name),
                profile_image_url=COALESCE(NULLIF(excluded.profile_image_url, ''), audience.profile_image_url),
                is_public_subscriber=MAX(audience.is_public_subscriber, excluded.is_public_subscriber),
                first_commented_at=CASE
                    WHEN audience.first_commented_at IS NULL THEN excluded.first_commented_at
                    WHEN excluded.first_commented_at IS NULL THEN audience.first_commented_at
                    WHEN excluded.first_commented_at < audience.first_commented_at THEN excluded.first_commented_at
                    ELSE audience.first_commented_at
                END,
                last_commented_at=CASE
                    WHEN audience.last_commented_at IS NULL THEN excluded.last_commented_at
                    WHEN excluded.last_commented_at IS NULL THEN audience.last_commented_at
                    WHEN excluded.last_commented_at > audience.last_commented_at THEN excluded.last_commented_at
                    ELSE audience.last_commented_at
                END,
                comment_count=excluded.comment_count
            """,
        )
        conn.commit()
        after_row = conn.execute("SELECT COUNT(*) AS count FROM audience").fetchone()
    before_count = int(before_row["count"] or 0) if before_row else 0
    after_count = int(after_row["count"] or 0) if after_row else 0
    return max(after_count - before_count, 0)
