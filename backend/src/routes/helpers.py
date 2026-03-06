"""Shared helper functions for route handlers."""

from __future__ import annotations

import sqlite3

from src.helper.estimates import (
    estimate_audience_api_calls,
    estimate_channel_analytics_api_calls,
    estimate_comments_api_calls,
    estimate_playlist_analytics_api_calls,
    estimate_playlists_api_calls,
    estimate_traffic_sources_api_calls,
    estimate_video_analytics_api_calls,
    estimate_video_search_insights_api_calls,
    estimate_video_traffic_source_api_calls,
    estimate_videos_api_calls,
)


def get_table_storage(conn: sqlite3.Connection) -> list[dict]:
    """Return per-table storage usage in bytes with percent normalized to tracked tables only."""
    table_rows = conn.execute(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%'"
    ).fetchall()
    table_names = [row["name"] for row in table_rows]
    if not table_names:
        return []
    try:
        object_rows = conn.execute("SELECT name, SUM(pgsize) AS bytes FROM dbstat GROUP BY name").fetchall()
    except sqlite3.OperationalError:
        return []

    object_bytes = {row["name"]: int(row["bytes"] or 0) for row in object_rows}
    index_rows = conn.execute(
        "SELECT name, tbl_name FROM sqlite_schema WHERE type = 'index' AND tbl_name NOT LIKE 'sqlite_%'"
    ).fetchall()
    index_to_table = {row["name"]: row["tbl_name"] for row in index_rows if row["name"] and row["tbl_name"]}

    totals = {name: object_bytes.get(name, 0) for name in table_names}
    for index_name, table_name in index_to_table.items():
        if table_name in totals:
            totals[table_name] += object_bytes.get(index_name, 0)

    sorted_totals = sorted(totals.items(), key=lambda item: item[1], reverse=True)
    tracked_total_bytes = sum(table_bytes for _, table_bytes in sorted_totals)
    output = []
    for table_name, table_bytes in sorted_totals:
        percent = round((table_bytes / tracked_total_bytes) * 100, 2) if tracked_total_bytes > 0 else 0.0
        output.append({"table": table_name, "bytes": table_bytes, "percent": percent})
    return output


def get_table_row_counts(conn: sqlite3.Connection) -> list[dict]:
    """Return row counts for all project tables except sync_runs."""
    table_rows = conn.execute(
        "SELECT name FROM sqlite_schema WHERE type = 'table' AND name NOT LIKE 'sqlite_%' AND name != 'sync_runs'"
    ).fetchall()
    table_names = sorted([str(row["name"]) for row in table_rows if row["name"]])
    output: list[dict] = []
    for table_name in table_names:
        try:
            row = conn.execute(f'SELECT COUNT(*) AS count FROM "{table_name}"').fetchone()
            count = int(row["count"] or 0) if row else 0
        except sqlite3.OperationalError:
            count = 0
        output.append({"table": table_name, "rows": count})
    return output


def get_ids_with_published_map(conn: sqlite3.Connection, table_name: str) -> tuple[list[str], dict[str, str]]:
    """Return entity ids and publish-date map (YYYY-MM-DD) for a table."""
    rows = conn.execute(f'SELECT id, date(published_at) AS published_date FROM "{table_name}"').fetchall()
    ids: list[str] = []
    published_by_id: dict[str, str] = {}
    for row in rows:
        entity_id = str(row["id"])
        ids.append(entity_id)
        if row["published_date"]:
            published_by_id[entity_id] = str(row["published_date"])
    return ids, published_by_id


def get_latest_by_id(conn: sqlite3.Connection, table_name: str, id_column: str) -> dict[str, str]:
    """Return grouped MAX(date) values for a table keyed by id column."""
    rows = conn.execute(
        f'SELECT "{id_column}" AS item_id, MAX(date) AS latest FROM "{table_name}" GROUP BY "{id_column}"'
    ).fetchall()
    output: dict[str, str] = {}
    for row in rows:
        if row["item_id"] and row["latest"]:
            output[str(row["item_id"])] = str(row["latest"])
    return output


def get_latest_date(conn: sqlite3.Connection, table_name: str) -> str | None:
    """Return MAX(date) for a table."""
    row = conn.execute(f'SELECT MAX(date) AS latest FROM "{table_name}"').fetchone()
    if not row or not row["latest"]:
        return None
    return str(row["latest"])


def get_earliest_published_date(conn: sqlite3.Connection, table_name: str) -> str | None:
    """Return MIN(date(published_at)) for a table."""
    row = conn.execute(f'SELECT MIN(date(published_at)) AS earliest FROM "{table_name}"').fetchone()
    if not row or not row["earliest"]:
        return None
    return str(row["earliest"])


def estimate_min_api_calls_for_table(
    conn: sqlite3.Connection,
    table: str,
    start_date: str | None,
    end_date: str | None,
    deep_sync: bool,
) -> dict:
    """Estimate minimum API calls for one selected table using shared estimator helpers."""
    video_ids, published_by_video = get_ids_with_published_map(conn, "videos")
    playlist_ids, published_by_playlist = get_ids_with_published_map(conn, "playlists")
    earliest_video_date = get_earliest_published_date(conn, "videos")
    earliest_playlist_date = get_earliest_published_date(conn, "playlists")

    if table == "videos":
        shorts_row = conn.execute("SELECT COUNT(*) AS count FROM videos WHERE content_type = 'short'").fetchone()
        shorts_count = int(shorts_row["count"] or 0) if shorts_row else 0
        result = estimate_videos_api_calls(video_count=len(video_ids), shorts_count=shorts_count)
        return {"minimum_api_calls": result.minimum_api_calls, "basis": result.basis}

    if table in {"playlists", "playlist_items"}:
        item_rows = conn.execute("SELECT item_count FROM playlists").fetchall()
        item_counts = [int(row["item_count"] or 0) for row in item_rows]
        result = estimate_playlists_api_calls(playlist_count=len(playlist_ids), playlist_item_counts=item_counts)
        return {"minimum_api_calls": result.minimum_api_calls, "basis": result.basis}

    if table == "comments":
        result = estimate_comments_api_calls(video_count=len(video_ids))
        return {"minimum_api_calls": result.minimum_api_calls, "basis": result.basis}

    if table == "audience":
        subscriber_row = conn.execute("SELECT COUNT(*) AS count FROM audience WHERE is_public_subscriber = 1").fetchone()
        public_subscribers = int(subscriber_row["count"] or 0) if subscriber_row else 0
        result = estimate_audience_api_calls(public_subscriber_count=public_subscribers)
        return {"minimum_api_calls": result.minimum_api_calls, "basis": result.basis}

    if table == "channel_analytics":
        latest = None if deep_sync else get_latest_date(conn, "channel_analytics")
        result = estimate_channel_analytics_api_calls(
            earliest_video_date=earliest_video_date,
            latest_channel_analytics_date=latest,
            start_date=start_date,
            end_date=end_date,
            deep_sync=deep_sync,
        )
        return {"minimum_api_calls": result.minimum_api_calls, "basis": result.basis}

    if table == "traffic_sources_daily":
        latest = None if deep_sync else get_latest_date(conn, "traffic_sources_daily")
        result = estimate_traffic_sources_api_calls(
            earliest_video_date=earliest_video_date,
            latest_traffic_sources_date=latest,
            start_date=start_date,
            end_date=end_date,
            deep_sync=deep_sync,
        )
        return {"minimum_api_calls": result.minimum_api_calls, "basis": result.basis}

    if table == "playlist_daily_analytics":
        latest_map = {} if deep_sync else get_latest_by_id(conn, "playlist_daily_analytics", "playlist_id")
        result = estimate_playlist_analytics_api_calls(
            playlist_ids=playlist_ids,
            published_by_playlist=published_by_playlist,
            latest_by_playlist=latest_map,
            earliest_playlist_date=earliest_playlist_date,
            start_date=start_date,
            end_date=end_date,
            deep_sync=deep_sync,
        )
        return {"minimum_api_calls": result.minimum_api_calls, "basis": result.basis}

    if table == "video_analytics":
        latest_map = {} if deep_sync else get_latest_by_id(conn, "video_analytics", "video_id")
        result = estimate_video_analytics_api_calls(
            video_ids=video_ids,
            published_by_video=published_by_video,
            latest_by_video=latest_map,
            earliest_video_date=earliest_video_date,
            start_date=start_date,
            end_date=end_date,
            deep_sync=deep_sync,
        )
        return {"minimum_api_calls": result.minimum_api_calls, "basis": result.basis}

    if table == "video_traffic_source":
        latest_map = {} if deep_sync else get_latest_by_id(conn, "video_traffic_source", "video_id")
        result = estimate_video_traffic_source_api_calls(
            video_ids=video_ids,
            published_by_video=published_by_video,
            latest_by_video=latest_map,
            earliest_video_date=earliest_video_date,
            start_date=start_date,
            end_date=end_date,
            deep_sync=deep_sync,
        )
        return {"minimum_api_calls": result.minimum_api_calls, "basis": result.basis}

    if table == "video_search_insights":
        latest_map = {} if deep_sync else get_latest_by_id(conn, "video_search_insights", "video_id")
        result = estimate_video_search_insights_api_calls(
            video_ids=video_ids,
            published_by_video=published_by_video,
            latest_by_video=latest_map,
            earliest_video_date=earliest_video_date,
            start_date=start_date,
            end_date=end_date,
            deep_sync=deep_sync,
        )
        return {"minimum_api_calls": result.minimum_api_calls, "basis": result.basis}

    return {"minimum_api_calls": 0, "basis": "table is DB-only / no direct Google API sync stage"}


_DATA_STAGE_TABLE: dict[str, str] = {
    "videos": "videos",
    "comments": "comments",
    "audience": "audience",
    "playlists": "playlists",
}

_ANALYTICS_STAGE_TABLE: dict[str, str] = {
    "playlist_analytics": "playlist_daily_analytics",
    "traffic": "traffic_sources_daily",
    "channel_analytics": "channel_analytics",
    "video_analytics": "video_analytics",
    "video_traffic_source": "video_traffic_source",
    "video_search_insights": "video_search_insights",
}


def estimate_data_pulls(
    conn: sqlite3.Connection,
    pulls: list[str],
    deep_sync: bool,
) -> dict[str, int]:
    """Estimate minimum API calls for each data-stage pull key."""
    result: dict[str, int] = {}
    for pull in pulls:
        table = _DATA_STAGE_TABLE.get(pull)
        if not table:
            continue
        data = estimate_min_api_calls_for_table(conn, table, None, None, deep_sync)
        result[pull] = data["minimum_api_calls"]
    return result


def estimate_analytics_pulls(
    conn: sqlite3.Connection,
    pulls: list[str],
    start_date: str | None,
    end_date: str | None,
    deep_sync: bool,
) -> dict[str, int]:
    """Estimate minimum API calls for each analytics-stage pull key."""
    result: dict[str, int] = {}
    for pull in pulls:
        table = _ANALYTICS_STAGE_TABLE.get(pull)
        if not table:
            continue
        data = estimate_min_api_calls_for_table(conn, table, start_date, end_date, deep_sync)
        result[pull] = data["minimum_api_calls"]
    return result


def resolve_table_date_bounds(conn: sqlite3.Connection, table_name: str) -> dict:
    """Return oldest/newest date values for the most suitable date-like column in a table."""
    info_rows = conn.execute(f'PRAGMA table_info("{table_name}")').fetchall()
    if not info_rows:
        return {"column": None, "oldest": None, "newest": None}
    columns = [str(row["name"]) for row in info_rows if row["name"]]
    preferred = [
        "date",
        "published_at",
        "updated_at",
        "started_at",
        "finished_at",
        "subscribed_at",
        "first_commented_at",
        "last_commented_at",
        "video_published_at",
    ]
    candidates = [name for name in preferred if name in columns]
    candidates.extend(
        name
        for name in columns
        if name not in candidates and (name.endswith("_at") or "date" in name.lower())
    )
    for column_name in candidates:
        try:
            row = conn.execute(
                f'SELECT MIN(date("{column_name}")) AS oldest, MAX(date("{column_name}")) AS newest FROM "{table_name}"'
            ).fetchone()
        except sqlite3.OperationalError:
            continue
        if row and (row["oldest"] or row["newest"]):
            return {
                "column": column_name,
                "oldest": str(row["oldest"]) if row["oldest"] else None,
                "newest": str(row["newest"]) if row["newest"] else None,
            }
    return {"column": None, "oldest": None, "newest": None}


def expected_value_label(column_name: str, declared_type: str, not_null: int) -> str:
    """Build a human-readable expected-value hint for one DB column."""
    lowered_name = (column_name or "").lower()
    lowered_type = (declared_type or "").upper()
    nullable_text = "required" if int(not_null or 0) == 1 else "nullable"
    if "INT" in lowered_type:
        if lowered_name.startswith("is_") or lowered_name.startswith("has_"):
            return f"0 or 1 boolean flag ({nullable_text})"
        return f"whole number ({nullable_text})"
    if any(token in lowered_type for token in ("REAL", "FLOAT", "DOUBLE", "DECIMAL", "NUMERIC")):
        return f"decimal number ({nullable_text})"
    if "BLOB" in lowered_type:
        return f"binary value ({nullable_text})"
    if "CHAR" in lowered_type or "CLOB" in lowered_type or "TEXT" in lowered_type or lowered_type == "":
        if lowered_name.endswith("_at") or "date" in lowered_name:
            return f"date/time text (ISO-like) ({nullable_text})"
        if lowered_name.endswith("_id") or lowered_name == "id":
            return f"identifier text ({nullable_text})"
        return f"text value ({nullable_text})"
    return f"value of type {declared_type or 'TEXT'} ({nullable_text})"
