from __future__ import annotations

from src.database.db import get_connection


def upsert_video_traffic_source(video_id: str, rows: list[dict]) -> int:
    """Insert or update per-video per-day traffic-source rows."""
    if not rows:
        return 0
    values = []
    for row in rows:
        values.append(
            (
                video_id,
                row.get("day"),
                row.get("insightTrafficSourceType"),
                row.get("views"),
                row.get("estimatedMinutesWatched"),
            )
        )
    sql = """
        INSERT INTO video_traffic_source (
            video_id, date, traffic_source, views, watch_time_minutes
        ) VALUES (
            ?, ?, ?, ?, ?
        )
        ON CONFLICT(video_id, date, traffic_source) DO UPDATE SET
            views=excluded.views,
            watch_time_minutes=excluded.watch_time_minutes
    """
    with get_connection() as conn:
        conn.executemany(sql, values)
        conn.commit()
    return len(values)



