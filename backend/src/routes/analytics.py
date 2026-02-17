from __future__ import annotations
from fastapi import APIRouter, HTTPException, Query
from src.database.db import get_connection, row_to_dict
from src.database.video_search_insights import get_search_term_videos, get_top_search_terms

router = APIRouter()


@router.get("/analytics/playlist-daily")
def list_playlist_daily(playlist_id: str, start_date: str, end_date: str) -> dict:
    """Return daily playlist-view analytics rows for one playlist and date range."""
    with get_connection() as conn:
        exists = conn.execute("SELECT 1 FROM playlists WHERE id = ? LIMIT 1", (playlist_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Playlist not found.")
        rows = conn.execute(
            """
            SELECT
                date AS day,
                SUM(COALESCE(playlist_views, 0)) AS views,
                SUM(COALESCE(playlist_estimated_minutes_watched, 0)) AS watch_time_minutes,
                AVG(COALESCE(playlist_average_view_duration_seconds, 0)) AS average_view_duration_seconds,
                SUM(COALESCE(playlist_starts, 0)) AS playlist_starts,
                AVG(COALESCE(views_per_playlist_start, 0)) AS views_per_playlist_start,
                AVG(COALESCE(average_time_in_playlist_seconds, 0)) AS average_time_in_playlist_seconds
            FROM playlist_daily_analytics
            WHERE playlist_id = ? AND date >= ? AND date <= ?
            GROUP BY date
            ORDER BY date ASC
            """,
            (playlist_id, start_date, end_date),
        ).fetchall()
    items = []
    for row in rows:
        item = row_to_dict(row)
        item["estimated_revenue"] = 0
        item["subscribers_gained"] = 0
        item["subscribers_lost"] = 0
        items.append(item)
    totals = {
        "views": sum(item.get("views") or 0 for item in items),
        "watch_time_minutes": sum(item.get("watch_time_minutes") or 0 for item in items),
        "estimated_revenue": 0,
        "subscribers_gained": 0,
        "subscribers_lost": 0,
        "average_view_duration_seconds": (
            sum(item.get("average_view_duration_seconds") or 0 for item in items) / len(items)
            if items
            else 0
        ),
        "playlist_starts": sum(item.get("playlist_starts") or 0 for item in items),
        "views_per_playlist_start": (
            sum(item.get("views_per_playlist_start") or 0 for item in items) / len(items)
            if items
            else 0
        ),
        "average_time_in_playlist_seconds": (
            sum(item.get("average_time_in_playlist_seconds") or 0 for item in items) / len(items)
            if items
            else 0
        ),
    }
    return {"items": items, "totals": totals}


@router.get("/analytics/playlist-video-daily")
def list_playlist_video_daily(playlist_id: str, start_date: str, end_date: str) -> dict:
    """Return daily video analytics summed across videos that are in a playlist."""
    with get_connection() as conn:
        exists = conn.execute("SELECT 1 FROM playlists WHERE id = ? LIMIT 1", (playlist_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Playlist not found.")
        rows = conn.execute(
            """
            WITH playlist_videos AS (
                SELECT DISTINCT video_id
                FROM playlist_items
                WHERE playlist_id = ? AND video_id IS NOT NULL
            )
            SELECT
                a.date AS day,
                SUM(COALESCE(a.views, 0)) AS views,
                SUM(COALESCE(a.watch_time_minutes, 0)) AS watch_time_minutes,
                SUM(COALESCE(a.estimated_revenue, 0)) AS estimated_revenue,
                SUM(COALESCE(a.ad_impressions, 0)) AS ad_impressions,
                SUM(COALESCE(a.monetized_playbacks, 0)) AS monetized_playbacks,
                CASE
                    WHEN SUM(COALESCE(a.ad_impressions, 0)) > 0
                    THEN SUM(COALESCE(a.cpm, 0) * COALESCE(a.ad_impressions, 0)) / SUM(COALESCE(a.ad_impressions, 0))
                    ELSE AVG(a.cpm)
                END AS cpm,
                SUM(COALESCE(a.subscribers_gained, 0)) AS subscribers_gained,
                SUM(COALESCE(a.subscribers_lost, 0)) AS subscribers_lost
            FROM video_analytics a
            JOIN playlist_videos pv ON pv.video_id = a.video_id
            WHERE a.date >= ? AND a.date <= ?
            GROUP BY a.date
            ORDER BY a.date ASC
            """,
            (playlist_id, start_date, end_date),
        ).fetchall()
    items = [row_to_dict(row) for row in rows]
    totals = {
        "views": sum(item.get("views") or 0 for item in items),
        "watch_time_minutes": sum(item.get("watch_time_minutes") or 0 for item in items),
        "estimated_revenue": sum(item.get("estimated_revenue") or 0 for item in items),
        "ad_impressions": sum(item.get("ad_impressions") or 0 for item in items),
        "monetized_playbacks": sum(item.get("monetized_playbacks") or 0 for item in items),
        "cpm": None,
        "subscribers_gained": sum(item.get("subscribers_gained") or 0 for item in items),
        "subscribers_lost": sum(item.get("subscribers_lost") or 0 for item in items),
    }
    if totals["ad_impressions"] > 0:
        totals["cpm"] = sum(
            (item.get("cpm") or 0) * (item.get("ad_impressions") or 0) for item in items
        ) / totals["ad_impressions"]
    else:
        totals["cpm"] = sum(item.get("cpm") or 0 for item in items) / len(items) if items else 0
    return {"items": items, "totals": totals}


@router.get("/analytics/playlist-traffic-sources")
def list_playlist_traffic_sources(playlist_id: str, start_date: str, end_date: str) -> dict:
    """Return daily traffic-source rows aggregated across videos in one playlist."""
    with get_connection() as conn:
        exists = conn.execute("SELECT 1 FROM playlists WHERE id = ? LIMIT 1", (playlist_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Playlist not found.")
        rows = conn.execute(
            """
            WITH playlist_videos AS (
                SELECT DISTINCT video_id
                FROM playlist_items
                WHERE playlist_id = ? AND video_id IS NOT NULL
            )
            SELECT
                vts.date AS day,
                vts.traffic_source AS traffic_source,
                SUM(COALESCE(vts.views, 0)) AS views,
                SUM(COALESCE(vts.watch_time_minutes, 0)) AS watch_time_minutes
            FROM video_traffic_source vts
            JOIN playlist_videos pv ON pv.video_id = vts.video_id
            WHERE vts.date >= ? AND vts.date <= ?
            GROUP BY vts.date, vts.traffic_source
            ORDER BY vts.date ASC, vts.traffic_source ASC
            """,
            (playlist_id, start_date, end_date),
        ).fetchall()
    items = [row_to_dict(row) for row in rows]
    return {"items": items}


@router.get("/analytics/playlist-video-traffic-source-top-videos")
def list_playlist_video_traffic_source_top_videos(
    playlist_id: str,
    start_date: str,
    end_date: str,
    traffic_source: str,
    limit: int = Query(default=5, ge=1, le=100),
) -> dict:
    """Return top playlist videos for one traffic source within a date range."""
    with get_connection() as conn:
        exists = conn.execute("SELECT 1 FROM playlists WHERE id = ? LIMIT 1", (playlist_id,)).fetchone()
        if not exists:
            raise HTTPException(status_code=404, detail="Playlist not found.")
        rows = conn.execute(
            """
            WITH playlist_videos AS (
                SELECT DISTINCT video_id
                FROM playlist_items
                WHERE playlist_id = ? AND video_id IS NOT NULL
            )
            SELECT
                v.id AS video_id,
                COALESCE(v.title, '(untitled)') AS title,
                COALESCE(v.thumbnail_url, '') AS thumbnail_url,
                COALESCE(v.published_at, '') AS published_at,
                SUM(vts.views) AS views,
                SUM(vts.watch_time_minutes) AS watch_time_minutes
            FROM video_traffic_source vts
            JOIN playlist_videos pv ON pv.video_id = vts.video_id
            LEFT JOIN videos v ON v.id = vts.video_id
            WHERE vts.date >= ? AND vts.date <= ? AND vts.traffic_source = ?
            GROUP BY vts.video_id
            ORDER BY views DESC, watch_time_minutes DESC
            LIMIT ?
            """,
            (playlist_id, start_date, end_date, traffic_source, limit),
        ).fetchall()
    items = [row_to_dict(row) for row in rows]
    return {"items": items}


@router.get("/analytics/video-daily")
def list_video_daily_analytics(
    start_date: str | None = None,
    end_date: str | None = None,
    video_id: str | None = None,
    limit: int = Query(default=1000, ge=1, le=10000),
) -> dict:
    """Return daily analytics with optional filters."""
    where_clauses = []
    params: list[object] = []

    if start_date:
        where_clauses.append("date >= ?")
        params.append(start_date)
    if end_date:
        where_clauses.append("date <= ?")
        params.append(end_date)
    if video_id:
        where_clauses.append("video_id = ?")
        params.append(video_id)

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    query = f"""
        SELECT
            video_id,
            date,
            engaged_views,
            views,
            watch_time_minutes,
            estimated_revenue,
            estimated_ad_revenue,
            gross_revenue,
            estimated_red_partner_revenue,
            average_view_duration_seconds,
            average_view_percentage,
            likes,
            comments,
            shares,
            monetized_playbacks,
            playback_based_cpm,
            ad_impressions,
            cpm,
            subscribers_gained,
            subscribers_lost
        FROM video_analytics
        {where_sql}
        ORDER BY date DESC
        LIMIT ?
    """
    params.append(limit)

    with get_connection() as conn:
        rows = conn.execute(query, tuple(params)).fetchall()
    return {"items": [row_to_dict(row) for row in rows]}


@router.get("/analytics/years")
def list_analytics_years() -> dict:
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


@router.get("/analytics/daily/summary")
def list_daily_summary(start_date: str, end_date: str, content_type: str | None = None) -> dict:
    """Return per-day totals and range KPIs, optionally filtered by video content type."""
    where_sql = "a.date >= ? AND a.date <= ?"
    params: list[object] = [start_date, end_date]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                a.date AS day,
                SUM(a.views) AS views,
                SUM(a.watch_time_minutes) AS watch_time_minutes,
                SUM(a.estimated_revenue) AS estimated_revenue,
                SUM(a.ad_impressions) AS ad_impressions,
                SUM(a.monetized_playbacks) AS monetized_playbacks,
                CASE
                    WHEN SUM(COALESCE(a.ad_impressions, 0)) > 0
                    THEN SUM(COALESCE(a.cpm, 0) * COALESCE(a.ad_impressions, 0)) / SUM(COALESCE(a.ad_impressions, 0))
                    ELSE AVG(a.cpm)
                END AS cpm,
                SUM(a.average_view_duration_seconds) AS average_view_duration_seconds,
                SUM(a.likes) AS likes,
                SUM(a.comments) AS comments,
                SUM(a.shares) AS shares,
                SUM(a.subscribers_gained) AS subscribers_gained,
                SUM(a.subscribers_lost) AS subscribers_lost
            FROM video_analytics a
            JOIN videos v ON v.id = a.video_id
            WHERE {where_sql}
            GROUP BY a.date
            ORDER BY a.date ASC
            """,
            tuple(params),
        ).fetchall()

    items = [row_to_dict(row) for row in rows]
    totals = {
        "views": sum(item.get("views") or 0 for item in items),
        "watch_time_minutes": sum(item.get("watch_time_minutes") or 0 for item in items),
        "estimated_revenue": sum(item.get("estimated_revenue") or 0 for item in items),
        "ad_impressions": sum(item.get("ad_impressions") or 0 for item in items),
        "monetized_playbacks": sum(item.get("monetized_playbacks") or 0 for item in items),
        "cpm": None,
        "subscribers_gained": sum(item.get("subscribers_gained") or 0 for item in items),
        "subscribers_lost": sum(item.get("subscribers_lost") or 0 for item in items),
    }
    if totals["ad_impressions"] > 0:
        totals["cpm"] = sum(
            (item.get("cpm") or 0) * (item.get("ad_impressions") or 0) for item in items
        ) / totals["ad_impressions"]
    else:
        totals["cpm"] = sum(item.get("cpm") or 0 for item in items) / len(items) if items else 0
    totals["subscribers_net"] = totals["subscribers_gained"] - totals["subscribers_lost"]
    return {"items": items, "totals": totals}


@router.get("/analytics/channel-daily")
def list_channel_daily(
    start_date: str,
    end_date: str,
) -> dict:
    """Return channel-level daily analytics rows for a range."""
    with get_connection() as conn:
        rows = conn.execute(
            """
            SELECT
                date AS day,
                engaged_views,
                views,
                watch_time_minutes,
                estimated_revenue,
                estimated_ad_revenue,
                gross_revenue,
                estimated_red_partner_revenue,
                average_view_duration_seconds,
                average_view_percentage,
                likes,
                dislikes,
                comments,
                shares,
                monetized_playbacks,
                playback_based_cpm,
                ad_impressions,
                cpm,
                impressions,
                impressions_ctr,
                subscribers_gained,
                subscribers_lost
            FROM channel_analytics
            WHERE date >= ? AND date <= ?
            ORDER BY date ASC
            """,
            (start_date, end_date),
        ).fetchall()

    items = [row_to_dict(row) for row in rows]
    totals = {
        "engaged_views": sum(item.get("engaged_views") or 0 for item in items),
        "views": sum(item.get("views") or 0 for item in items),
        "watch_time_minutes": sum(item.get("watch_time_minutes") or 0 for item in items),
        "estimated_revenue": sum(item.get("estimated_revenue") or 0 for item in items),
        "estimated_ad_revenue": sum(item.get("estimated_ad_revenue") or 0 for item in items),
        "gross_revenue": sum(item.get("gross_revenue") or 0 for item in items),
        "estimated_red_partner_revenue": sum(item.get("estimated_red_partner_revenue") or 0 for item in items),
        "average_view_duration_seconds": sum(item.get("average_view_duration_seconds") or 0 for item in items),
        "average_view_percentage": sum(item.get("average_view_percentage") or 0 for item in items),
        "likes": sum(item.get("likes") or 0 for item in items),
        "dislikes": sum(item.get("dislikes") or 0 for item in items),
        "comments": sum(item.get("comments") or 0 for item in items),
        "shares": sum(item.get("shares") or 0 for item in items),
        "monetized_playbacks": sum(item.get("monetized_playbacks") or 0 for item in items),
        "playback_based_cpm": sum(item.get("playback_based_cpm") or 0 for item in items),
        "ad_impressions": sum(item.get("ad_impressions") or 0 for item in items),
        "cpm": sum(item.get("cpm") or 0 for item in items),
        "impressions": sum(item.get("impressions") or 0 for item in items),
        "impressions_ctr": sum(item.get("impressions_ctr") or 0 for item in items),
        "subscribers_gained": sum(item.get("subscribers_gained") or 0 for item in items),
        "subscribers_lost": sum(item.get("subscribers_lost") or 0 for item in items),
    }
    return {"items": items, "totals": totals}


@router.get("/analytics/traffic-sources")
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


@router.get("/analytics/video-traffic-sources")
def list_video_traffic_sources(
    start_date: str,
    end_date: str,
    content_type: str | None = None,
    video_id: str | None = None,
) -> dict:
    """Return video-level daily traffic-source rows for a range, optionally filtered by content type."""
    where_sql = "vts.date >= ? AND vts.date <= ?"
    params: list[object] = [start_date, end_date]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)
    if video_id:
        where_sql += " AND vts.video_id = ?"
        params.append(video_id)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                vts.date AS day,
                vts.traffic_source AS traffic_source,
                SUM(vts.views) AS views,
                SUM(vts.watch_time_minutes) AS watch_time_minutes
            FROM video_traffic_source vts
            JOIN videos v ON v.id = vts.video_id
            WHERE {where_sql}
            GROUP BY vts.date, vts.traffic_source
            ORDER BY vts.date ASC, vts.traffic_source ASC
            """,
            tuple(params),
        ).fetchall()
    items = [row_to_dict(row) for row in rows]
    return {"items": items}


@router.get("/analytics/video-traffic-source-top-videos")
def list_video_traffic_source_top_videos(
    start_date: str,
    end_date: str,
    traffic_source: str,
    content_type: str | None = None,
    limit: int = Query(default=10, ge=1, le=100),
) -> dict:
    """Return top videos for one traffic source within a date range, optionally filtered by content type."""
    where_sql = "vts.date >= ? AND vts.date <= ? AND vts.traffic_source = ?"
    params: list[object] = [start_date, end_date, traffic_source]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)
    params.append(limit)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                v.id AS video_id,
                COALESCE(v.title, '(untitled)') AS title,
                COALESCE(v.thumbnail_url, '') AS thumbnail_url,
                COALESCE(v.published_at, '') AS published_at,
                SUM(vts.views) AS views,
                SUM(vts.watch_time_minutes) AS watch_time_minutes
            FROM video_traffic_source vts
            JOIN videos v ON v.id = vts.video_id
            WHERE {where_sql}
            GROUP BY v.id
            ORDER BY views DESC, watch_time_minutes DESC
            LIMIT ?
            """,
            tuple(params),
        ).fetchall()
    items = [row_to_dict(row) for row in rows]
    return {"items": items}


@router.get("/analytics/video-search-insights")
def list_video_search_insights(
    start_date: str,
    end_date: str,
    video_ids: str | None = None,
    content_type: str | None = None,
) -> dict:
    """Return top search terms by views from monthly search insights rows."""
    parsed_video_ids = (
        [value.strip() for value in video_ids.split(",") if value and value.strip()]
        if video_ids
        else []
    )
    items = get_top_search_terms(
        start_date=start_date,
        end_date=end_date,
        video_ids=parsed_video_ids if parsed_video_ids else None,
        content_type=content_type,
    )
    return {"items": items}


@router.get("/analytics/video-search-insights/videos")
def list_video_search_insight_videos(
    start_date: str,
    end_date: str,
    search_term: str,
    content_type: str | None = None,
    video_ids: str | None = None,
) -> dict:
    """Return videos for one search term sorted by search-driven views."""
    parsed_video_ids = (
        [value.strip() for value in video_ids.split(",") if value and value.strip()]
        if video_ids
        else []
    )
    items = get_search_term_videos(
        start_date=start_date,
        end_date=end_date,
        search_term=search_term,
        content_type=content_type,
        video_ids=parsed_video_ids if parsed_video_ids else None,
    )
    return {"items": items}


@router.get("/analytics/top-content")
def list_top_content(
    start_date: str,
    end_date: str,
    limit: int = 10,
    content_type: str | None = None,
    privacy_status: str | None = None,
    sort_by: str = Query(default="views"),
    direction: str = Query(default="desc"),
) -> dict:
    """Return content in a date range, sorted by supported metric/date, optionally filtered by content type."""
    where_sql = "a.date >= ? AND a.date <= ?"
    params: list[object] = [start_date, end_date]
    if content_type:
        where_sql += " AND v.content_type = ?"
        params.append(content_type)
    if privacy_status:
        where_sql += " AND v.privacy_status = ?"
        params.append(privacy_status)
    sort_map = {
        "views": "views",
        "estimated_revenue": "estimated_revenue",
        "published_at": "COALESCE(v.published_at, '')",
    }
    sort_column = sort_map.get(sort_by, "views")
    sort_dir = "ASC" if direction.lower() == "asc" else "DESC"
    params.append(limit)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                v.id AS video_id,
                v.title AS title,
                v.published_at AS published_at,
                v.thumbnail_url AS thumbnail_url,
                v.duration_seconds AS duration_seconds,
                SUM(a.views) AS views,
                SUM(a.watch_time_minutes) AS watch_time_minutes,
                SUM(a.estimated_revenue) AS estimated_revenue,
                AVG(a.average_view_duration_seconds) AS avg_view_duration_seconds
            FROM video_analytics a
            JOIN videos v ON v.id = a.video_id
            WHERE {where_sql}
            GROUP BY v.id
            ORDER BY {sort_column} {sort_dir}, views DESC
            LIMIT ?
            """,
            tuple(params),
        ).fetchall()
    items = []
    for row in rows:
        duration_seconds = row["duration_seconds"] or 0
        avg_view_duration_seconds = row["avg_view_duration_seconds"] or 0
        avg_view_pct = 0.0
        if duration_seconds:
            avg_view_pct = (avg_view_duration_seconds / duration_seconds) * 100
        items.append(
            {
                "video_id": row["video_id"],
                "title": row["title"] or "(untitled)",
                "published_at": row["published_at"] or "",
                "thumbnail_url": row["thumbnail_url"] or "",
                "views": row["views"] or 0,
                "watch_time_minutes": row["watch_time_minutes"] or 0,
                "estimated_revenue": row["estimated_revenue"] or 0,
                "avg_view_duration_seconds": avg_view_duration_seconds,
                "avg_view_pct": avg_view_pct,
            }
        )
    return {"items": items}
