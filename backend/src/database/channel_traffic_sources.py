from __future__ import annotations

from src.database.db import get_connection


def upsert_channel_traffic_sources(rows: list[dict]) -> int:
    """Insert or update traffic source rows by day."""
    if not rows:
        return 0
    values = []
    for row in rows:
        values.append(
            (
                row.get("day"),
                row.get("insightTrafficSourceType"),
                row.get("views"),
                row.get("estimatedMinutesWatched"),
            )
        )
    sql = """
        INSERT INTO traffic_sources_daily (
            date, traffic_source, views, watch_time_minutes
        ) VALUES (
            ?, ?, ?, ?
        )
        ON CONFLICT(date, traffic_source) DO UPDATE SET
            views=excluded.views,
            watch_time_minutes=excluded.watch_time_minutes
    """
    with get_connection() as conn:
        conn.executemany(sql, values)
        conn.commit()
    return len(values)
