from __future__ import annotations

import re
from datetime import date as date_type, datetime, timedelta

from src.database.db import get_connection
from src.youtube.analytics import DateRange, determine_date_range

_IDENTIFIER_RE = re.compile(r"^[A-Za-z_][A-Za-z0-9_]*$")


def _validate_identifier(name: str) -> str:
    """Validate SQL identifier used for internal table/column references."""
    if not _IDENTIFIER_RE.match(name):
        raise ValueError(f"Invalid SQL identifier: {name}")
    return name


def build_sync_date_range(
    earliest: str,
    start_date: str | None = None,
    end_date: str | None = None,
) -> DateRange | None:
    """Build sync range from earliest date, apply overrides, and clamp to today."""
    date_range = determine_date_range(earliest)
    if start_date:
        date_range = DateRange(start=start_date, end=date_range.end)
    if end_date:
        date_range = DateRange(start=date_range.start, end=end_date)
    return clamp_date_range_to_today(date_range)


def clamp_date_range_to_today(date_range: DateRange) -> DateRange | None:
    """Clamp date range to today; return None when start is in the future."""
    today = date_type.today().isoformat()
    if date_range.start > today:
        return None
    if date_range.end > today:
        return DateRange(start=date_range.start, end=today)
    return date_range


def find_next_sync_date(latest_date: str | None, fallback_start: str) -> str:
    """Return day after latest stored date, or fallback start when latest is missing."""
    if not latest_date:
        return fallback_start
    return next_day(latest_date)


def next_day(iso_date: str) -> str:
    """Return ISO date string for the day after the provided ISO date."""
    return (datetime.fromisoformat(iso_date).date() + timedelta(days=1)).isoformat()


def normalize_iso_datetime_to_date(value: str) -> str:
    """Normalize ISO datetime text to YYYY-MM-DD date-only format."""
    return value.split("T", 1)[0]


def get_latest_date(table: str, date_column: str = "date", is_timestamp: bool = False) -> str | None:
    """Return latest date value from one table/column pair."""
    safe_table = _validate_identifier(table)
    safe_date_column = _validate_identifier(date_column)
    select_expr = f"date({safe_date_column})" if is_timestamp else safe_date_column
    with get_connection() as conn:
        row = conn.execute(f"SELECT MAX({select_expr}) AS latest FROM {safe_table}").fetchone()
    if not row or not row["latest"]:
        return None
    return str(row["latest"])


def get_earliest_date(table: str, date_column: str = "date", is_timestamp: bool = False) -> str | None:
    """Return earliest date value from one table/column pair."""
    safe_table = _validate_identifier(table)
    safe_date_column = _validate_identifier(date_column)
    select_expr = f"date({safe_date_column})" if is_timestamp else safe_date_column
    with get_connection() as conn:
        row = conn.execute(f"SELECT MIN({select_expr}) AS earliest FROM {safe_table}").fetchone()
    if not row or not row["earliest"]:
        return None
    return str(row["earliest"])


def get_latest_grouped_dates(
    table: str,
    group_column: str,
    date_column: str = "date",
) -> dict[str, str]:
    """Return latest dates grouped by key column for a table."""
    safe_table = _validate_identifier(table)
    safe_group_column = _validate_identifier(group_column)
    safe_date_column = _validate_identifier(date_column)
    with get_connection() as conn:
        rows = conn.execute(
            (
                f"SELECT {safe_group_column} AS group_key, MAX({safe_date_column}) AS latest "
                f"FROM {safe_table} GROUP BY {safe_group_column}"
            )
        ).fetchall()
    latest_by_group: dict[str, str] = {}
    for row in rows:
        if row["latest"]:
            latest_by_group[str(row["group_key"])] = str(row["latest"])
    return latest_by_group
