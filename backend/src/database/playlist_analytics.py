from __future__ import annotations

from src.database.db import get_connection


def upsert_playlist_analytics(playlist_id: str, rows: list[dict]) -> int:
    """Insert or update daily playlist analytics rows for a playlist."""
    if not rows:
        return 0
    values = []
    for row in rows:
        values.append(
            (
                playlist_id,
                row.get("day"),
                row.get("playlistViews"),
                row.get("playlistEstimatedMinutesWatched"),
                row.get("playlistAverageViewDuration"),
                row.get("playlistStarts"),
                row.get("viewsPerPlaylistStart"),
                row.get("averageTimeInPlaylist"),
            )
        )
    sql = """
        INSERT INTO playlist_daily_analytics (
            playlist_id, date, playlist_views,
            playlist_estimated_minutes_watched, playlist_average_view_duration_seconds,
            playlist_starts, views_per_playlist_start, average_time_in_playlist_seconds
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(playlist_id, date) DO UPDATE SET
            playlist_views=excluded.playlist_views,
            playlist_estimated_minutes_watched=excluded.playlist_estimated_minutes_watched,
            playlist_average_view_duration_seconds=excluded.playlist_average_view_duration_seconds,
            playlist_starts=excluded.playlist_starts,
            views_per_playlist_start=excluded.views_per_playlist_start,
            average_time_in_playlist_seconds=excluded.average_time_in_playlist_seconds
    """
    with get_connection() as conn:
        conn.executemany(sql, values)
        conn.commit()
    return len(values)
