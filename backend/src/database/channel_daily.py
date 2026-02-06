from __future__ import annotations

from src.database.db import get_connection


def upsert_channel_daily(rows: list[dict]) -> int:
    """Insert or update channel-level daily analytics rows."""
    if not rows:
        return 0
    values = []
    for row in rows:
        values.append(
            (
                row.get("day"),
                row.get("views"),
                row.get("estimatedMinutesWatched"),
                row.get("estimatedRevenue"),
                row.get("averageViewDuration"),
                row.get("impressions"),
                row.get("impressionsClickThroughRate"),
                row.get("subscribersGained"),
                row.get("subscribersLost"),
            )
        )
    sql = """
        INSERT INTO channel_daily_analytics (
            date, views, watch_time_minutes, estimated_revenue,
            average_view_duration_seconds, impressions, impressions_ctr,
            subscribers_gained, subscribers_lost
        ) VALUES (
            ?, ?, ?, ?, ?, ?, ?, ?, ?
        )
        ON CONFLICT(date) DO UPDATE SET
            views=excluded.views,
            watch_time_minutes=excluded.watch_time_minutes,
            estimated_revenue=excluded.estimated_revenue,
            average_view_duration_seconds=excluded.average_view_duration_seconds,
            impressions=excluded.impressions,
            impressions_ctr=excluded.impressions_ctr,
            subscribers_gained=excluded.subscribers_gained,
            subscribers_lost=excluded.subscribers_lost
    """
    with get_connection() as conn:
        conn.executemany(sql, values)
        conn.commit()
    return len(values)
