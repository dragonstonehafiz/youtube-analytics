"""Sync-related API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.database.db import get_connection, row_to_dict
from src.routes.helpers import estimate_analytics_pulls, estimate_data_pulls
from src.sync import (
    ANALYTICS_STAGES,
    DATA_STAGES,
    SyncQueueItem,
    sync_analytics,
    sync_data,
    sync_progress,
)
from src.youtube.videos import get_channel_info

router = APIRouter()


@router.get("/health")
def health() -> dict:
    """Return basic health status."""
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


class _DataSyncItem(BaseModel):
    stage: str
    deep_sync: bool = False


class _DataSyncBody(BaseModel):
    items: list[_DataSyncItem]


class _AnalyticsSyncItem(BaseModel):
    stage: str
    deep_sync: bool = False
    start_date: str | None = None
    end_date: str | None = None


class _AnalyticsSyncBody(BaseModel):
    items: list[_AnalyticsSyncItem]


@router.post("/sync/data")
def sync_data_route(body: _DataSyncBody, background_tasks: BackgroundTasks) -> JSONResponse:
    """Trigger a YouTube Data API sync.

    Each item in ``body.items`` specifies its own stage and deep_sync option.
    Items are processed in the order provided.

    Args:
        body: JSON with ``items`` list; each item has ``stage`` and ``deep_sync``.
    """
    if not body.items:
        return JSONResponse(status_code=422, content={"error": "items must not be empty."})
    invalid = [i.stage for i in body.items if i.stage not in DATA_STAGES]
    if invalid:
        return JSONResponse(
            status_code=422,
            content={"error": f"Invalid data stage(s): {', '.join(invalid)}. Valid: {', '.join(DATA_STAGES)}"},
        )
    if not sync_progress.try_start():
        return JSONResponse(status_code=409, content={"error": "A sync is already running."})
    queue = [SyncQueueItem(stage=i.stage, deep_sync=i.deep_sync) for i in body.items]
    background_tasks.add_task(sync_data, queue)
    return JSONResponse(content={"queued": True})


@router.post("/sync/analytics")
def sync_analytics_route(body: _AnalyticsSyncBody, background_tasks: BackgroundTasks) -> JSONResponse:
    """Trigger a YouTube Analytics API sync.

    Each item specifies its own stage and deep_sync option; the shared date range
    in ``body`` is applied to all analytics items.

    Args:
        body: JSON with ``items`` list and optional ``start_date`` / ``end_date``.
    """
    if not body.items:
        return JSONResponse(status_code=422, content={"error": "items must not be empty."})
    invalid = [i.stage for i in body.items if i.stage not in ANALYTICS_STAGES]
    if invalid:
        return JSONResponse(
            status_code=422,
            content={"error": f"Invalid analytics stage(s): {', '.join(invalid)}. Valid: {', '.join(ANALYTICS_STAGES)}"},
        )
    if not sync_progress.try_start():
        return JSONResponse(status_code=409, content={"error": "A sync is already running."})
    queue = [
        SyncQueueItem(
            stage=i.stage,
            deep_sync=i.deep_sync,
            start_date=i.start_date,
            end_date=i.end_date,
        )
        for i in body.items
    ]
    background_tasks.add_task(sync_analytics, queue)
    return JSONResponse(content={"queued": True})


@router.get("/sync/data/estimate")
def get_data_estimate(
    pull: str | None = None,
    deep_sync: bool = False,
) -> JSONResponse:
    """Estimate minimum YouTube Data API v3 calls for selected data pulls.

    Args:
        pull: Comma-separated pull keys. Defaults to all data pulls.
        deep_sync: Whether to assume a full re-fetch.
    """
    if pull:
        pulls = [p.strip() for p in pull.split(",") if p.strip()]
        invalid = [p for p in pulls if p not in DATA_STAGES]
        if invalid:
            return JSONResponse(
                status_code=422,
                content={"error": f"Invalid data stage(s): {', '.join(invalid)}."},
            )
    else:
        pulls = list(DATA_STAGES)
    with get_connection() as conn:
        by_pull = estimate_data_pulls(conn, pulls, deep_sync)
    return JSONResponse(content={"by_pull": by_pull, "total": sum(by_pull.values())})


@router.get("/sync/analytics/estimate")
def get_analytics_estimate(
    pull: str | None = None,
    start_date: str | None = None,
    end_date: str | None = None,
    deep_sync: bool = False,
) -> JSONResponse:
    """Estimate minimum YouTube Analytics API v2 calls for selected analytics pulls.

    Args:
        pull: Comma-separated pull keys. Defaults to all analytics pulls.
        start_date: ISO date string. Defaults to earliest available.
        end_date: ISO date string. Defaults to yesterday.
        deep_sync: Whether to assume a full re-fetch.
    """
    if pull:
        pulls = [p.strip() for p in pull.split(",") if p.strip()]
        invalid = [p for p in pulls if p not in ANALYTICS_STAGES]
        if invalid:
            return JSONResponse(
                status_code=422,
                content={"error": f"Invalid analytics stage(s): {', '.join(invalid)}."},
            )
    else:
        pulls = list(ANALYTICS_STAGES)
    with get_connection() as conn:
        by_pull = estimate_analytics_pulls(conn, pulls, start_date, end_date, deep_sync)
    return JSONResponse(content={"by_pull": by_pull, "total": sum(by_pull.values())})


@router.post("/sync/stop")
def stop_sync() -> dict:
    """Request a graceful stop for the currently running sync."""
    accepted = sync_progress.request_stop()
    return {"accepted": accepted}


@router.get("/sync/progress")
def get_sync_progress_state() -> dict:
    """Return in-memory sync progress state."""
    return sync_progress.to_dict()


@router.get("/sync/runs")
def list_sync_runs(limit: int = 10, offset: int = 0) -> dict:
    """Return recent sync run rows with pagination."""
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    with get_connection() as conn:
        total = conn.execute("SELECT COUNT(*) AS count FROM sync_runs").fetchone()[0]
        rows = conn.execute(
            "SELECT id, started_at, finished_at, start_date, end_date, "
            "table_name, deep_sync, total_api_calls, status, error "
            "FROM sync_runs ORDER BY id DESC LIMIT ? OFFSET ?",
            (safe_limit, safe_offset),
        ).fetchall()
    return {"items": [row_to_dict(row) for row in rows], "total": total}
