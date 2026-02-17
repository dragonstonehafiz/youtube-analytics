from __future__ import annotations

from src.database.db import get_connection, row_to_dict


def upsert_video_search_insights(video_id: str, rows: list[dict]) -> int:
    """Insert or update per-video per-month YouTube-search term insight rows."""
    if not rows:
        return 0
    values = []
    for row in rows:
        values.append(
            (
                video_id,
                row.get("day"),
                row.get("insightTrafficSourceDetail"),
                row.get("views"),
                row.get("estimatedMinutesWatched"),
            )
        )
    sql = """
        INSERT INTO video_search_insights (
            video_id, date, search_term, views, watch_time_minutes
        ) VALUES (
            ?, ?, ?, ?, ?
        )
        ON CONFLICT(video_id, date, search_term) DO UPDATE SET
            views=excluded.views,
            watch_time_minutes=excluded.watch_time_minutes
    """
    with get_connection() as conn:
        conn.executemany(sql, values)
        conn.commit()
    return len(values)


def get_top_search_terms(
    start_date: str,
    end_date: str,
    video_ids: list[str] | None = None,
    content_type: str | None = None,
) -> list[dict]:
    """Return top search terms by views from monthly search insights rows."""
    where_clauses = ["vsi.date >= ?", "vsi.date <= ?"]
    params: list[object] = [start_date, end_date]
    if content_type:
        where_clauses.append("v.content_type = ?")
        params.append(content_type)
    if video_ids:
        placeholders = ",".join("?" for _ in video_ids)
        where_clauses.append(f"vsi.video_id IN ({placeholders})")
        params.extend(video_ids)
    where_sql = " AND ".join(where_clauses)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                vsi.search_term AS search_term,
                SUM(COALESCE(vsi.views, 0)) AS views,
                SUM(COALESCE(vsi.watch_time_minutes, 0)) AS watch_time_minutes,
                COUNT(DISTINCT vsi.video_id) AS video_count
            FROM video_search_insights vsi
            JOIN videos v ON v.id = vsi.video_id
            WHERE {where_sql}
            GROUP BY vsi.search_term
            ORDER BY views DESC, watch_time_minutes DESC, search_term ASC
            """,
            tuple(params),
        ).fetchall()
    return [row_to_dict(row) for row in rows]


def get_search_term_videos(
    start_date: str,
    end_date: str,
    search_term: str,
    content_type: str | None = None,
    video_ids: list[str] | None = None,
) -> list[dict]:
    """Return videos for one search term, sorted by views from search descending."""
    where_clauses = ["vsi.date >= ?", "vsi.date <= ?", "vsi.search_term = ?"]
    params: list[object] = [start_date, end_date, search_term]
    if content_type:
        where_clauses.append("v.content_type = ?")
        params.append(content_type)
    if video_ids:
        placeholders = ",".join("?" for _ in video_ids)
        where_clauses.append(f"vsi.video_id IN ({placeholders})")
        params.extend(video_ids)
    where_sql = " AND ".join(where_clauses)
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT
                v.id AS video_id,
                COALESCE(v.title, '(untitled)') AS title,
                COALESCE(v.thumbnail_url, '') AS thumbnail_url,
                SUM(COALESCE(vsi.views, 0)) AS views,
                SUM(COALESCE(vsi.watch_time_minutes, 0)) AS watch_time_minutes
            FROM video_search_insights vsi
            JOIN videos v ON v.id = vsi.video_id
            WHERE {where_sql}
            GROUP BY v.id
            ORDER BY views DESC, watch_time_minutes DESC, title ASC
            """,
            tuple(params),
        ).fetchall()
    return [row_to_dict(row) for row in rows]



