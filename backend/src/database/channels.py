"""Database helpers for channels table."""

from __future__ import annotations

import json


def get_channel(conn, channel_id: str) -> dict | None:
    """Return channel row by channel_id, or None."""
    row = conn.execute(
        "SELECT * FROM channels WHERE channel_id = ?",
        (channel_id,),
    ).fetchone()
    return dict(row) if row else None


def get_all_channels(conn) -> list[dict]:
    """Return all channels."""
    rows = conn.execute("SELECT * FROM channels ORDER BY label").fetchall()
    return [dict(row) for row in rows]


def upsert_channel(conn, channel_data: dict) -> None:
    """Upsert a channel row. Expects channel_id as key."""
    channel_id = channel_data.get("channel_id")
    if not channel_id:
        raise ValueError("channel_data must include channel_id")

    # Serialize JSON fields
    topic_ids = channel_data.get("topic_ids")
    if isinstance(topic_ids, list):
        topic_ids = json.dumps(topic_ids)

    topic_categories = channel_data.get("topic_categories")
    if isinstance(topic_categories, list):
        topic_categories = json.dumps(topic_categories)

    conn.execute(
        """INSERT INTO channels (
            channel_id, label, description, custom_url, thumbnail_url,
            video_count, subscriber_count, hidden_subscriber_count, view_count,
            uploads_playlist_id, topic_ids, topic_categories, privacy_status,
            is_linked, long_uploads_status, made_for_kids, is_own
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(channel_id) DO UPDATE SET
            label = excluded.label,
            description = excluded.description,
            custom_url = excluded.custom_url,
            thumbnail_url = excluded.thumbnail_url,
            video_count = excluded.video_count,
            subscriber_count = excluded.subscriber_count,
            hidden_subscriber_count = excluded.hidden_subscriber_count,
            view_count = excluded.view_count,
            uploads_playlist_id = excluded.uploads_playlist_id,
            topic_ids = excluded.topic_ids,
            topic_categories = excluded.topic_categories,
            privacy_status = excluded.privacy_status,
            is_linked = excluded.is_linked,
            long_uploads_status = excluded.long_uploads_status,
            made_for_kids = excluded.made_for_kids,
            is_own = excluded.is_own
        """,
        (
            channel_id,
            channel_data.get("label"),
            channel_data.get("description"),
            channel_data.get("custom_url"),
            channel_data.get("thumbnail_url"),
            channel_data.get("video_count", 0),
            channel_data.get("subscriber_count"),
            channel_data.get("hidden_subscriber_count"),
            channel_data.get("view_count"),
            channel_data.get("uploads_playlist_id"),
            topic_ids,
            topic_categories,
            channel_data.get("privacy_status"),
            channel_data.get("is_linked"),
            channel_data.get("long_uploads_status"),
            channel_data.get("made_for_kids"),
            channel_data.get("is_own", 0),
        ),
    )
    conn.commit()


def delete_channel(conn, channel_id: str) -> None:
    """Delete a channel by channel_id."""
    conn.execute("DELETE FROM channels WHERE channel_id = ?", (channel_id,))
    conn.commit()
