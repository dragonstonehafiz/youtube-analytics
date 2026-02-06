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
