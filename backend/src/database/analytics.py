from __future__ import annotations

from src.database.db import get_connection


def upsert_daily_analytics(video_id: str, rows: list[dict]) -> int:
    """Insert or update daily analytics rows for a video."""
    if not rows:
        return 0

    values = []
    for row in rows:
        values.append(
            (
                video_id,
                row.get("day"),
                row.get("views"),
                row.get("estimatedMinutesWatched"),
                row.get("estimatedRevenue"),
                row.get("averageViewDuration"),
                row.get("likes"),
                row.get("comments"),
                row.get("shares"),
                row.get("subscribersGained"),
                row.get("subscribersLost"),
            )
        )

    sql = """
        INSERT INTO daily_analytics (
            video_id, date, views, watch_time_minutes, estimated_revenue,
            average_view_duration_seconds, likes, comments, shares,
            subscribers_gained, subscribers_lost
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(video_id, date) DO UPDATE SET
            views=excluded.views,
            watch_time_minutes=excluded.watch_time_minutes,
            estimated_revenue=excluded.estimated_revenue,
            average_view_duration_seconds=excluded.average_view_duration_seconds,
            likes=excluded.likes,
            comments=excluded.comments,
            shares=excluded.shares,
            subscribers_gained=excluded.subscribers_gained,
            subscribers_lost=excluded.subscribers_lost
    """

    with get_connection() as conn:
        conn.executemany(sql, values)
        conn.commit()
    return len(values)
