from __future__ import annotations

import sqlite3
from pathlib import Path

from config import settings

SCHEMA_PATH = Path(__file__).resolve().parent / "schema.sql"


def get_connection() -> sqlite3.Connection:
    """Open a SQLite connection with row access by column name."""
    settings.data_dir.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(settings.db_path)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON;")
    return conn


def row_to_dict(row: sqlite3.Row) -> dict:
    """Convert a SQLite row to a plain dict, excluding BLOB columns."""
    # BLOB columns to exclude from JSON serialization
    blob_columns = {"title_embedding"}

    item = {key: row[key] for key in row.keys() if key not in blob_columns}
    if "view_count" in item:
        item["views"] = item.pop("view_count")
    if "views" in item:
        item["views"] = item.pop("views")
    return item


def init_db() -> None:
    """Create database tables if they do not already exist."""
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with get_connection() as conn:
        conn.executescript(schema_sql)
        _ensure_video_columns(conn)
        _ensure_videos_competitors_columns(conn)
        _ensure_playlists_columns(conn)
        _ensure_daily_analytics_columns(conn)
        _ensure_video_insights_tables(conn)
        _ensure_channel_daily_columns(conn)
        _ensure_sync_run_columns(conn)
        _ensure_comment_columns(conn)
        _ensure_playlist_daily_columns(conn)
        _ensure_playlist_items_schema(conn)
        _ensure_audience_columns(conn)
        _ensure_traffic_sources_daily_columns(conn)


def _ensure_video_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to videos table if missing (idempotent) and remove deprecated ones."""
    # Remove deprecated columns
    try:
        conn.execute("ALTER TABLE videos DROP COLUMN description_embedding")
    except sqlite3.OperationalError:
        pass

    # All columns from schema.sql videos table
    columns = [
        ("id", "TEXT PRIMARY KEY"),
        ("title", "TEXT NOT NULL"),
        ("description", "TEXT"),
        ("published_at", "TEXT"),
        ("channel_id", "TEXT"),
        ("channel_title", "TEXT"),
        ("privacy_status", "TEXT"),
        ("made_for_kids", "INTEGER"),
        ("duration_seconds", "INTEGER"),
        ("view_count", "INTEGER"),
        ("like_count", "INTEGER"),
        ("comment_count", "INTEGER"),
        ("favorite_count", "INTEGER"),
        ("thumbnail_url", "TEXT"),
        ("content_type", "TEXT"),
        ("title_embedding", "BLOB"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE videos ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue
    conn.commit()


def _ensure_sync_run_columns(conn: sqlite3.Connection) -> None:
    """Migrate sync_runs to the current schema, dropping old data if the structure changed."""
    existing = {row[1] for row in conn.execute("PRAGMA table_info(sync_runs)").fetchall()}
    if "total_api_calls" in existing:
        return
    conn.execute("DROP TABLE IF EXISTS sync_runs")
    conn.execute(
        """
        CREATE TABLE sync_runs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            finished_at TEXT,
            start_date TEXT,
            end_date TEXT,
            table_name TEXT NOT NULL,
            deep_sync INTEGER NOT NULL DEFAULT 0,
            total_api_calls INTEGER NOT NULL DEFAULT 0,
            status TEXT NOT NULL DEFAULT 'running',
            error TEXT
        )
        """
    )


def _ensure_channel_daily_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to channel_analytics table if missing (idempotent)."""
    # All columns from schema.sql channel_analytics table
    columns = [
        ("date", "TEXT PRIMARY KEY"),
        ("engaged_views", "INTEGER"),
        ("views", "INTEGER"),
        ("watch_time_minutes", "REAL"),
        ("estimated_revenue", "REAL"),
        ("estimated_ad_revenue", "REAL"),
        ("gross_revenue", "REAL"),
        ("estimated_red_partner_revenue", "REAL"),
        ("average_view_duration_seconds", "REAL"),
        ("average_view_percentage", "REAL"),
        ("likes", "INTEGER"),
        ("dislikes", "INTEGER"),
        ("comments", "INTEGER"),
        ("shares", "INTEGER"),
        ("monetized_playbacks", "INTEGER"),
        ("playback_based_cpm", "REAL"),
        ("ad_impressions", "INTEGER"),
        ("cpm", "REAL"),
        ("subscribers_gained", "INTEGER"),
        ("subscribers_lost", "INTEGER"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE channel_analytics ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue


def _ensure_daily_analytics_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to video_analytics table if missing (idempotent)."""
    # All columns from schema.sql video_analytics table
    columns = [
        ("video_id", "TEXT NOT NULL"),
        ("date", "TEXT NOT NULL"),
        ("engaged_views", "INTEGER"),
        ("views", "INTEGER"),
        ("watch_time_minutes", "REAL"),
        ("estimated_revenue", "REAL"),
        ("estimated_ad_revenue", "REAL"),
        ("gross_revenue", "REAL"),
        ("estimated_red_partner_revenue", "REAL"),
        ("average_view_duration_seconds", "REAL"),
        ("average_view_percentage", "REAL"),
        ("likes", "INTEGER"),
        ("comments", "INTEGER"),
        ("shares", "INTEGER"),
        ("monetized_playbacks", "INTEGER"),
        ("playback_based_cpm", "REAL"),
        ("ad_impressions", "INTEGER"),
        ("cpm", "REAL"),
        ("subscribers_gained", "INTEGER"),
        ("subscribers_lost", "INTEGER"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE video_analytics ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue


def _ensure_video_insights_tables(conn: sqlite3.Connection) -> None:
    """Create per-video traffic/search insight tables and indexes if missing."""
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS video_traffic_source (
            video_id TEXT NOT NULL,
            date TEXT NOT NULL,
            traffic_source TEXT NOT NULL,
            views INTEGER,
            watch_time_minutes REAL,
            PRIMARY KEY (video_id, date, traffic_source),
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_video_traffic_source_date ON video_traffic_source(date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_video_traffic_source_video ON video_traffic_source(video_id)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_video_traffic_source_type ON video_traffic_source(traffic_source)")

    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS video_search_insights (
            video_id TEXT NOT NULL,
            date TEXT NOT NULL,
            search_term TEXT NOT NULL,
            views INTEGER,
            watch_time_minutes REAL,
            CHECK (substr(date, 9, 2) = '01'),
            PRIMARY KEY (video_id, date, search_term),
            FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
        )
        """
    )
    conn.execute("CREATE INDEX IF NOT EXISTS idx_video_search_insights_date ON video_search_insights(date)")
    conn.execute("CREATE INDEX IF NOT EXISTS idx_video_search_insights_video ON video_search_insights(video_id)")


def _ensure_comment_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to comments table if missing (idempotent)."""
    # All columns from schema.sql comments table
    columns = [
        ("id", "TEXT PRIMARY KEY"),
        ("video_id", "TEXT NOT NULL"),
        ("reply_count", "INTEGER"),
        ("author_name", "TEXT"),
        ("author_channel_id", "TEXT"),
        ("author_profile_image_url", "TEXT"),
        ("text_display", "TEXT"),
        ("like_count", "INTEGER"),
        ("published_at", "TEXT"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE comments ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue


def _ensure_playlist_daily_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to playlist_daily_analytics table if missing (idempotent)."""
    # All columns from schema.sql playlist_daily_analytics table
    columns = [
        ("playlist_id", "TEXT NOT NULL"),
        ("date", "TEXT NOT NULL"),
        ("playlist_views", "INTEGER"),
        ("playlist_estimated_minutes_watched", "REAL"),
        ("playlist_average_view_duration_seconds", "REAL"),
        ("playlist_starts", "INTEGER"),
        ("views_per_playlist_start", "REAL"),
        ("average_time_in_playlist_seconds", "REAL"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE playlist_daily_analytics ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue


def _ensure_videos_competitors_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to videos_competitors table if missing (idempotent) and remove deprecated ones."""
    # Remove deprecated columns
    try:
        conn.execute("ALTER TABLE videos_competitors DROP COLUMN description_embedding")
    except sqlite3.OperationalError:
        pass

    # All columns from schema.sql videos_competitors table
    columns = [
        ("id", "TEXT PRIMARY KEY"),
        ("title", "TEXT"),
        ("description", "TEXT"),
        ("published_at", "TEXT"),
        ("channel_id", "TEXT"),
        ("channel_title", "TEXT"),
        ("privacy_status", "TEXT"),
        ("made_for_kids", "INTEGER"),
        ("duration_seconds", "INTEGER"),
        ("view_count", "INTEGER"),
        ("like_count", "INTEGER"),
        ("comment_count", "INTEGER"),
        ("favorite_count", "INTEGER"),
        ("thumbnail_url", "TEXT"),
        ("content_type", "TEXT"),
        ("title_embedding", "BLOB"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE videos_competitors ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue
    conn.commit()


def _ensure_playlists_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to playlists table if missing (idempotent)."""
    # All columns from schema.sql playlists table
    columns = [
        ("id", "TEXT PRIMARY KEY"),
        ("title", "TEXT"),
        ("description", "TEXT"),
        ("published_at", "TEXT"),
        ("channel_id", "TEXT"),
        ("channel_title", "TEXT"),
        ("privacy_status", "TEXT"),
        ("item_count", "INTEGER"),
        ("thumbnail_url", "TEXT"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE playlists ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue


def _ensure_audience_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to audience table if missing (idempotent)."""
    # All columns from schema.sql audience table
    columns = [
        ("channel_id", "TEXT PRIMARY KEY"),
        ("display_name", "TEXT"),
        ("profile_image_url", "TEXT"),
        ("is_public_subscriber", "INTEGER NOT NULL DEFAULT 0"),
        ("subscribed_at", "TEXT"),
        ("first_commented_at", "TEXT"),
        ("last_commented_at", "TEXT"),
        ("comment_count", "INTEGER NOT NULL DEFAULT 0"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE audience ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue


def _ensure_traffic_sources_daily_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to traffic_sources_daily table if missing (idempotent)."""
    # All columns from schema.sql traffic_sources_daily table
    columns = [
        ("date", "TEXT NOT NULL"),
        ("traffic_source", "TEXT NOT NULL"),
        ("views", "INTEGER"),
        ("watch_time_minutes", "REAL"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE traffic_sources_daily ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue


def _ensure_playlist_items_schema(conn: sqlite3.Connection) -> None:
    """Ensure playlist_items has only playlist FK and keeps raw video IDs."""
    table_row = conn.execute(
        "SELECT name FROM sqlite_master WHERE type = 'table' AND name = 'playlist_items'"
    ).fetchone()
    if not table_row:
        return
    fk_rows = conn.execute("PRAGMA foreign_key_list('playlist_items')").fetchall()
    has_video_fk = any(str(row["table"]) == "videos" for row in fk_rows)
    if not has_video_fk:
        return
    conn.execute("PRAGMA foreign_keys = OFF;")
    try:
        conn.execute(
            """
            CREATE TABLE IF NOT EXISTS playlist_items_new (
                id TEXT PRIMARY KEY,
                playlist_id TEXT NOT NULL,
                video_id TEXT,
                position INTEGER,
                title TEXT,
                description TEXT,
                published_at TEXT,
                video_published_at TEXT,
                channel_id TEXT,
                channel_title TEXT,
                privacy_status TEXT,
                thumbnail_url TEXT,
                FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
            )
            """
        )
        conn.execute(
            """
            INSERT INTO playlist_items_new (
                id, playlist_id, video_id, position, title, description,
                published_at, video_published_at, channel_id, channel_title,
                privacy_status, thumbnail_url
            )
            SELECT
                id, playlist_id, video_id, position, title, description,
                published_at, video_published_at, channel_id, channel_title,
                privacy_status, thumbnail_url
            FROM playlist_items
            """
        )
        conn.execute("DROP TABLE playlist_items")
        conn.execute("ALTER TABLE playlist_items_new RENAME TO playlist_items")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_playlist_items_video ON playlist_items(video_id)")
        conn.execute("CREATE INDEX IF NOT EXISTS idx_playlist_items_position ON playlist_items(playlist_id, position)")
        conn.commit()
    finally:
        conn.execute("PRAGMA foreign_keys = ON;")

