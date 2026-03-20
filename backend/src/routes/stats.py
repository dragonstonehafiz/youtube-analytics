"""Stats and database info API endpoints."""

from __future__ import annotations

from fastapi import APIRouter

from src.database.db import get_connection
from src.routes.helpers import (
    get_table_row_counts,
    get_table_storage,
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


@router.get("/stats/years/channel")
def get_channel_years() -> dict:
    """Return distinct years present in daily analytics data."""
    with get_connection() as conn:
        daily_row = conn.execute(
            "SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM video_analytics"
        ).fetchone()
        channel_row = conn.execute(
            "SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM channel_analytics"
        ).fetchone()
    min_dates = [row["min_date"] for row in (daily_row, channel_row) if row and row["min_date"]]
    max_dates = [row["max_date"] for row in (daily_row, channel_row) if row and row["max_date"]]
    if not min_dates or not max_dates:
        return {"years": []}
    min_year = int(str(min(min_dates))[:4])
    max_year = int(str(max(max_dates))[:4])
    years = [str(year) for year in range(max_year, min_year - 1, -1)]
    return {"years": years}


@router.get("/stats/years/video")
def get_video_years(video_id: str) -> dict:
    """Return year range for a specific video."""
    with get_connection() as conn:
        row = conn.execute(
            "SELECT MIN(date) AS min_date, MAX(date) AS max_date FROM video_analytics WHERE video_id = ?",
            (video_id,)
        ).fetchone()
    if not row or not row["min_date"] or not row["max_date"]:
        return {"years": []}
    min_year = int(str(row["min_date"])[:4])
    max_year = int(str(row["max_date"])[:4])
    years = [str(year) for year in range(max_year, min_year - 1, -1)]
    return {"years": years}


@router.get("/stats/channel-card-summary")
def get_channel_card_summary(
    current_start: str,
    current_end: str,
    previous_start: str,
    previous_end: str,
) -> dict:
    """Return all data needed by the channel analytics dashboard card in a single query."""
    with get_connection() as conn:
        row = conn.execute(
            """
            SELECT
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN views ELSE 0 END), 0)               AS current_views,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN watch_time_minutes ELSE 0 END), 0)  AS current_watch_time_minutes,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN estimated_revenue ELSE 0 END), 0)   AS current_estimated_revenue,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN subscribers_gained ELSE 0 END), 0)  AS current_subscribers_gained,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN subscribers_lost ELSE 0 END), 0)    AS current_subscribers_lost,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN views ELSE 0 END), 0)               AS previous_views,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN watch_time_minutes ELSE 0 END), 0)  AS previous_watch_time_minutes,
                COALESCE(SUM(CASE WHEN date >= ? AND date <= ? THEN estimated_revenue ELSE 0 END), 0)   AS previous_estimated_revenue,
                COALESCE(SUM(subscribers_gained), 0) - COALESCE(SUM(subscribers_lost), 0)              AS subscribers_net
            FROM channel_analytics
            WHERE date <= ?
            """,
            (
                current_start, current_end,
                current_start, current_end,
                current_start, current_end,
                current_start, current_end,
                current_start, current_end,
                previous_start, previous_end,
                previous_start, previous_end,
                previous_start, previous_end,
                current_end,
            ),
        ).fetchone()
    r = dict(row) if row else {}
    return {
        "subscribers_net": r.get("subscribers_net", 0),
        "current": {
            "views": r.get("current_views", 0),
            "watch_time_minutes": r.get("current_watch_time_minutes", 0),
            "estimated_revenue": r.get("current_estimated_revenue", 0),
            "subscribers_gained": r.get("current_subscribers_gained", 0),
            "subscribers_lost": r.get("current_subscribers_lost", 0),
        },
        "previous": {
            "views": r.get("previous_views", 0),
            "watch_time_minutes": r.get("previous_watch_time_minutes", 0),
            "estimated_revenue": r.get("previous_estimated_revenue", 0),
        },
    }
