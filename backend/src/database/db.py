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
    """Convert a SQLite row to a plain dict."""
    return {key: row[key] for key in row.keys()}


def init_db() -> None:
    """Create database tables if they do not already exist."""
    schema_sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with get_connection() as conn:
        conn.executescript(schema_sql)
        _ensure_video_columns(conn)
        _ensure_channel_daily_columns(conn)
        _ensure_sync_run_columns(conn)
        _ensure_comment_columns(conn)


def _ensure_video_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to videos table if missing (idempotent)."""
    columns = [
        ("video_width", "INTEGER"),
        ("video_height", "INTEGER"),
        ("content_type", "TEXT"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE videos ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue


def _ensure_sync_run_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to sync_runs table if missing (idempotent)."""
    columns = [
        ("start_date", "TEXT"),
        ("end_date", "TEXT"),
        ("deep_sync", "INTEGER DEFAULT 0"),
        ("pulls", "TEXT"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE sync_runs ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue


def _ensure_channel_daily_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to channel_daily_analytics table if missing (idempotent)."""
    columns = [
        ("subscribers_gained", "INTEGER"),
        ("subscribers_lost", "INTEGER"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE channel_daily_analytics ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue


def _ensure_comment_columns(conn: sqlite3.Connection) -> None:
    """Add new columns to comments table if missing (idempotent)."""
    columns = [
        ("author_profile_image_url", "TEXT"),
        ("reply_count", "INTEGER"),
    ]
    for name, col_type in columns:
        try:
            conn.execute(f"ALTER TABLE comments ADD COLUMN {name} {col_type}")
        except sqlite3.OperationalError:
            continue
