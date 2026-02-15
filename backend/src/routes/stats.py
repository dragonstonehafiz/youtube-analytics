"""Stats and database info API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, HTTPException

from src.database.db import get_connection, row_to_dict
from src.routes.helpers import (
    estimate_min_api_calls_for_table,
    expected_value_label,
    get_table_row_counts,
    get_table_storage,
    resolve_table_date_bounds,
)

router = APIRouter()


@router.get("/stats/overview")
def get_overview_stats() -> dict:
    """Return basic database and channel totals."""
    with get_connection() as conn:
        page_count = conn.execute("PRAGMA page_count").fetchone()[0]
        page_size = conn.execute("PRAGMA page_size").fetchone()[0]
        db_size_bytes = page_count * page_size
        total_uploads = conn.execute("SELECT COUNT(*) AS count FROM videos").fetchone()[0]
        total_playlists = conn.execute("SELECT COUNT(*) AS count FROM playlists").fetchone()[0]
        total_audience = conn.execute("SELECT COUNT(*) AS count FROM audience").fetchone()[0]
        total_views_row = conn.execute("SELECT SUM(views) AS total FROM channel_analytics").fetchone()
        total_views = total_views_row["total"] if total_views_row and total_views_row["total"] is not None else 0
        total_comments_row = conn.execute("SELECT COUNT(*) AS count FROM comments").fetchone()
        total_comments = total_comments_row["count"] if total_comments_row and total_comments_row["count"] is not None else 0
        earliest_row = conn.execute("SELECT MIN(date) AS earliest FROM video_analytics").fetchone()
        latest_row = conn.execute("SELECT MAX(date) AS latest FROM video_analytics").fetchone()
        earliest_date = earliest_row["earliest"] if earliest_row else None
        latest_date = latest_row["latest"] if latest_row else None
        video_rows = conn.execute("SELECT COUNT(*) AS count FROM video_analytics").fetchone()
        channel_rows = conn.execute("SELECT COUNT(*) AS count FROM channel_analytics").fetchone()
        traffic_rows = conn.execute("SELECT COUNT(*) AS count FROM traffic_sources_daily").fetchone()
        video_traffic_rows = conn.execute("SELECT COUNT(*) AS count FROM video_traffic_source").fetchone()
        video_search_rows = conn.execute("SELECT COUNT(*) AS count FROM video_search_insights").fetchone()
        playlist_analytics_rows = conn.execute("SELECT COUNT(*) AS count FROM playlist_daily_analytics").fetchone()
        video_analytics_rows = video_rows["count"] if video_rows and video_rows["count"] is not None else 0
        channel_analytics_rows = channel_rows["count"] if channel_rows and channel_rows["count"] is not None else 0
        traffic_sources_rows = traffic_rows["count"] if traffic_rows and traffic_rows["count"] is not None else 0
        video_traffic_source_rows = (
            video_traffic_rows["count"] if video_traffic_rows and video_traffic_rows["count"] is not None else 0
        )
        video_search_rows_total = (
            video_search_rows["count"] if video_search_rows and video_search_rows["count"] is not None else 0
        )
        total_playlist_analytics_rows = (
            playlist_analytics_rows["count"]
            if playlist_analytics_rows and playlist_analytics_rows["count"] is not None
            else 0
        )
        table_storage = get_table_storage(conn)
        table_row_counts = get_table_row_counts(conn)
    return {
        "db_size_bytes": db_size_bytes,
        "total_uploads": total_uploads,
        "total_playlists": total_playlists,
        "total_audience": total_audience,
        "total_views": total_views,
        "total_comments": total_comments,
        "earliest_date": earliest_date,
        "latest_date": latest_date,
        "video_analytics_rows": video_analytics_rows,
        "channel_analytics_rows": channel_analytics_rows,
        "traffic_sources_rows": traffic_sources_rows,
        "video_traffic_source_rows": video_traffic_source_rows,
        "video_search_rows": video_search_rows_total,
        "playlist_analytics_rows": total_playlist_analytics_rows,
        "table_storage": table_storage,
        "table_row_counts": table_row_counts,
    }


@router.get("/stats/table-details")
def get_table_details(table: str) -> dict:
    """Return date bounds and column expectations for one table."""
    if not table:
        raise HTTPException(status_code=400, detail="Missing table name.")
    with get_connection() as conn:
        exists_row = conn.execute(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ? AND name NOT LIKE 'sqlite_%'",
            (table,),
        ).fetchone()
        if not exists_row:
            raise HTTPException(status_code=404, detail="Table not found.")
        info_rows = conn.execute(f'PRAGMA table_info("{table}")').fetchall()
        columns = [
            {
                "name": str(row["name"]),
                "declared_type": str(row["type"] or "TEXT"),
                "expected_value": expected_value_label(str(row["name"]), str(row["type"] or ""), int(row["notnull"] or 0)),
            }
            for row in info_rows
        ]
        bounds = resolve_table_date_bounds(conn, table)
    return {
        "table": table,
        "date_column": bounds["column"],
        "oldest_item_date": bounds["oldest"],
        "newest_item_date": bounds["newest"],
        "columns": columns,
    }


@router.get("/stats/table-api-calls")
def get_table_api_calls(
    table: str,
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> dict:
    """Estimate minimum Google API calls for a selected table and sync period."""
    if not table:
        raise HTTPException(status_code=400, detail="Missing table name.")
    with get_connection() as conn:
        exists_row = conn.execute(
            "SELECT 1 FROM sqlite_schema WHERE type = 'table' AND name = ? AND name NOT LIKE 'sqlite_%'",
            (table,),
        ).fetchone()
        if not exists_row:
            raise HTTPException(status_code=404, detail="Table not found.")
        estimate = estimate_min_api_calls_for_table(conn, table, start_date, end_date, deep_sync)
    return {
        "table": table,
        "deep_sync": deep_sync,
        "minimum_api_calls": int(estimate["minimum_api_calls"]),
        "basis": estimate["basis"],
    }
