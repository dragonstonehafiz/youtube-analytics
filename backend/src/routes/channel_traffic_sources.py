from __future__ import annotations

from fastapi import APIRouter
from src.database.db import get_connection, row_to_dict

router = APIRouter()


@router.get("/analytics/channel-traffic-sources")
def list_channel_traffic_sources(start_date: str, end_date: str) -> dict:
    """Return channel-level daily traffic-source rows for a range."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                date AS day,
                traffic_source,
                views,
                watch_time_minutes
            FROM traffic_sources_daily
            WHERE date >= ? AND date <= ?
            ORDER BY date ASC, traffic_source ASC
            """,
            (start_date, end_date),
        ).fetchall()
    items = [row_to_dict(row) for row in rows]
    return {"items": items}
