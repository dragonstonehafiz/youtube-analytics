"""Sync-related API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks

from src.database.db import get_connection, row_to_dict
from src.sync import sync_all, sync_progress
from src.youtube.videos import get_channel_info

router = APIRouter()


@router.get("/health")
def health() -> dict:
    """Return basic health status and startup configuration."""
    return {"ok": True}


@router.get("/me")
def me() -> dict:
    """Return authenticated channel metadata."""
    channel = get_channel_info()
    snippet = channel.get("snippet", {})
    stats = channel.get("statistics", {})
    return {
        "id": channel.get("id"),
        "title": snippet.get("title"),
        "description": snippet.get("description"),
        "published_at": snippet.get("publishedAt"),
        "country": snippet.get("country"),
        "view_count": stats.get("viewCount"),
        "subscriber_count": stats.get("subscriberCount"),
        "video_count": stats.get("videoCount"),
    }


@router.post("/sync")
def sync(
    background_tasks: BackgroundTasks,
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
    start_data: str | None = None,
    pull: str | None = None,
) -> dict:
    """Trigger a sync with optional date range and deep sync flag."""
    # Allow start_data as an alias for start_date (typo-friendly).
    if start_date is None and start_data is not None:
        start_date = start_data
    pulls: list[str] | None = None
    if pull:
        pulls = [item.strip() for item in pull.split(",") if item.strip()]
    background_tasks.add_task(
        sync_all,
        start_date=start_date,
        end_date=end_date,
        deep_sync=deep_sync,
        pulls=pulls,
    )
    return {"queued": True}


@router.post("/sync/stop")
def stop_sync() -> dict:
    """Request graceful stop for current sync (after current API call returns)."""
    accepted = sync_progress.request_stop()
    return {"accepted": accepted}


@router.get("/sync/status")
def get_sync_status() -> dict:
    """Return the latest sync run status."""
    with get_connection() as conn:
        row = conn.execute(
            (
                "SELECT id, started_at, finished_at, status, COALESCE(error, error_message) AS error, "
                "start_date, end_date, deep_sync, pulls "
                "FROM sync_runs ORDER BY id DESC LIMIT 1"
            )
        ).fetchone()
    return {"run": row_to_dict(row) if row else None}


@router.get("/sync/runs")
def list_sync_runs(limit: int = 10, offset: int = 0) -> dict:
    """Return recent sync runs with pagination."""
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    with get_connection() as conn:
        total = conn.execute("SELECT COUNT(*) AS count FROM sync_runs").fetchone()[0]
        rows = conn.execute(
            (
                "SELECT id, started_at, finished_at, status, COALESCE(error, error_message) AS error, "
                "start_date, end_date, deep_sync, pulls "
                "FROM sync_runs ORDER BY id DESC LIMIT ? OFFSET ?"
            ),
            (safe_limit, safe_offset),
        ).fetchall()
    return {"items": [row_to_dict(row) for row in rows], "total": total}


@router.get("/sync/progress")
def get_sync_progress_state() -> dict:
    """Return in-memory sync progress state."""
    return sync_progress.to_dict()
