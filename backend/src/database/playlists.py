from __future__ import annotations

from src.database.db import get_connection


def upsert_playlists(rows: list[dict]) -> int:
    """Insert or update playlist rows and return processed count."""
    if not rows:
        return 0
    with get_connection() as conn:
        playlist_columns = {str(row["name"]) for row in conn.execute("PRAGMA table_info('playlists')").fetchall()}
        playlist_item_columns = {str(row["name"]) for row in conn.execute("PRAGMA table_info('playlist_items')").fetchall()}
    has_playlist_updated_at = "updated_at" in playlist_columns
    has_playlist_item_updated_at = "updated_at" in playlist_item_columns
    values = []
    for row in rows:
        snippet = row.get("snippet", {})
        status = row.get("status", {})
        content = row.get("contentDetails", {})
        values.append(
            (
                row.get("id"),
                snippet.get("title"),
                snippet.get("description"),
                snippet.get("publishedAt"),
                snippet.get("channelId"),
                snippet.get("channelTitle"),
                status.get("privacyStatus"),
                int(content["itemCount"]) if "itemCount" in content else None,
                snippet.get("thumbnails", {}).get("high", {}).get("url"),
            )
        )
    if has_playlist_updated_at:
        sql = """
            INSERT INTO playlists (
                id, title, description, published_at, channel_id, channel_title,
                privacy_status, item_count, thumbnail_url, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
            )
            ON CONFLICT(id) DO UPDATE SET
                title=excluded.title,
                description=excluded.description,
                published_at=excluded.published_at,
                channel_id=excluded.channel_id,
                channel_title=excluded.channel_title,
                privacy_status=excluded.privacy_status,
                item_count=excluded.item_count,
                thumbnail_url=excluded.thumbnail_url,
                updated_at=CURRENT_TIMESTAMP
        """
    else:
        sql = """
            INSERT INTO playlists (
                id, title, description, published_at, channel_id, channel_title,
                privacy_status, item_count, thumbnail_url
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            ON CONFLICT(id) DO UPDATE SET
                title=excluded.title,
                description=excluded.description,
                published_at=excluded.published_at,
                channel_id=excluded.channel_id,
                channel_title=excluded.channel_title,
                privacy_status=excluded.privacy_status,
                item_count=excluded.item_count,
                thumbnail_url=excluded.thumbnail_url
        """
    with get_connection() as conn:
        conn.executemany(sql, values)
        conn.commit()
    return len(values)


def replace_playlist_items(playlist_id: str, rows: list[dict]) -> int:
    """Replace one playlist's items with the provided rows and return processed count."""
    values = []
    with get_connection() as conn:
        playlist_item_columns = {str(row["name"]) for row in conn.execute("PRAGMA table_info('playlist_items')").fetchall()}
    has_playlist_item_updated_at = "updated_at" in playlist_item_columns
    if has_playlist_item_updated_at:
        sql = """
            INSERT INTO playlist_items (
                id, playlist_id, video_id, position, title, description,
                published_at, video_published_at, channel_id, channel_title,
                privacy_status, thumbnail_url, updated_at
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP
            )
            ON CONFLICT(id) DO UPDATE SET
                playlist_id=excluded.playlist_id,
                video_id=excluded.video_id,
                position=excluded.position,
                title=excluded.title,
                description=excluded.description,
                published_at=excluded.published_at,
                video_published_at=excluded.video_published_at,
                channel_id=excluded.channel_id,
                channel_title=excluded.channel_title,
                privacy_status=excluded.privacy_status,
                thumbnail_url=excluded.thumbnail_url,
                updated_at=CURRENT_TIMESTAMP
        """
    else:
        sql = """
            INSERT INTO playlist_items (
                id, playlist_id, video_id, position, title, description,
                published_at, video_published_at, channel_id, channel_title,
                privacy_status, thumbnail_url
            ) VALUES (
                ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
            )
            ON CONFLICT(id) DO UPDATE SET
                playlist_id=excluded.playlist_id,
                video_id=excluded.video_id,
                position=excluded.position,
                title=excluded.title,
                description=excluded.description,
                published_at=excluded.published_at,
                video_published_at=excluded.video_published_at,
                channel_id=excluded.channel_id,
                channel_title=excluded.channel_title,
                privacy_status=excluded.privacy_status,
                thumbnail_url=excluded.thumbnail_url
        """
    with get_connection() as conn:
        for row in rows:
            snippet = row.get("snippet", {})
            content = row.get("contentDetails", {})
            status = row.get("status", {})
            resource_id = snippet.get("resourceId", {})
            raw_video_id = resource_id.get("videoId")
            video_id = str(raw_video_id) if raw_video_id else None
            values.append(
                (
                    row.get("id"),
                    playlist_id,
                    video_id,
                    snippet.get("position"),
                    snippet.get("title"),
                    snippet.get("description"),
                    snippet.get("publishedAt"),
                    content.get("videoPublishedAt"),
                    snippet.get("videoOwnerChannelId"),
                    snippet.get("videoOwnerChannelTitle"),
                    status.get("privacyStatus"),
                    snippet.get("thumbnails", {}).get("high", {}).get("url"),
                )
            )
        conn.execute("DELETE FROM playlist_items WHERE playlist_id = ?", (playlist_id,))
        if values:
            conn.executemany(sql, values)
        conn.commit()
    return len(values)


def delete_playlists_not_in(playlist_ids: list[str]) -> int:
    """Delete playlist rows that are not present in the latest API response."""
    with get_connection() as conn:
        if playlist_ids:
            placeholders = ",".join("?" for _ in playlist_ids)
            result = conn.execute(
                f"DELETE FROM playlists WHERE id NOT IN ({placeholders})",
                tuple(playlist_ids),
            )
        else:
            result = conn.execute("DELETE FROM playlists")
        conn.commit()
    return int(result.rowcount or 0)
