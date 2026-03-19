"""Sync-related API endpoints."""

from __future__ import annotations

from fastapi import APIRouter, BackgroundTasks
from fastapi.responses import JSONResponse
from pydantic import BaseModel

from src.database.db import get_connection, row_to_dict
from src.routes.helpers import estimate_analytics_pulls, estimate_data_pulls
from src.utils.estimates import estimate_competitors_api_calls
from src.sync import (
    ANALYTICS_STAGES,
    DATA_STAGES,
    SyncQueueItem,
    sync_analytics,
    sync_data,
    sync_channels,
    sync_progress,
)
from src.utils.logger import get_logger
from src.youtube.videos import get_channel_info

router = APIRouter()
_logger = get_logger("sync_routes")


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
        "views": stats.get("viewCount"),
        "subscriber_count": stats.get("subscriberCount"),
        "video_count": stats.get("videoCount"),
    }


class _DataSyncItem(BaseModel):
    stage: str


class _DataSyncBody(BaseModel):
    items: list[_DataSyncItem]


class _AnalyticsSyncItem(BaseModel):
    stage: str
    deep_sync: bool = False
    start_date: str | None = None
    end_date: str | None = None


class _AnalyticsSyncBody(BaseModel):
    items: list[_AnalyticsSyncItem]


class _ChannelsSyncBody(BaseModel):
    channel_ids: list[str] | None = None


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
    queue = [SyncQueueItem(stage=i.stage) for i in body.items]
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


@router.post("/sync/channels")
def sync_channels_route(body: _ChannelsSyncBody = None, background_tasks: BackgroundTasks = None) -> JSONResponse:
    """Trigger a channel video sync.

    Syncs specified channels from the channels table into videos_competitors table.

    Args:
        body: Optional request body with 'channel_ids' list of channel IDs to sync.
              If not provided or empty list, syncs all channels.
    """
    if not sync_progress.try_start():
        return JSONResponse(status_code=409, content={"error": "A sync is already running."})

    channel_ids = body.channel_ids if body else None

    background_tasks.add_task(sync_channels, channel_ids=channel_ids)
    return JSONResponse(content={"queued": True})


@router.get("/sync/data/estimate")
def get_data_estimate(
    pull: str | None = None,
) -> JSONResponse:
    """Estimate minimum YouTube Data API v3 calls for selected data pulls.

    Args:
        pull: Comma-separated pull keys. Defaults to all data pulls.
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
        by_pull = estimate_data_pulls(conn, pulls)
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


@router.get("/sync/channels/estimate")
def get_channels_estimate(channel_ids: str | None = None) -> JSONResponse:
    """Estimate minimum YouTube Data API v3 calls for channels sync.

    Args:
        channel_ids: Comma-separated list of channel IDs to estimate for.
                    If not provided, estimates for all configured channels.
    """
    try:
        from src.database.channels import get_all_channels
        with get_connection() as conn:
            all_channels = get_all_channels(conn)

        # Filter to requested channel_ids if provided
        if channel_ids:
            requested_ids = set(ch.strip() for ch in channel_ids.split(",") if ch.strip())
            channels = [ch for ch in all_channels if ch.get("channel_id") in requested_ids]
        else:
            channels = all_channels

        video_counts = [int(ch.get("video_count", 0)) for ch in channels]

        if not video_counts:
            return JSONResponse(content={"total": 0, "basis": "no channels to estimate"})

        result = estimate_competitors_api_calls(video_counts)
        return JSONResponse(content={"total": result.minimum_api_calls, "basis": result.basis})
    except Exception:
        return JSONResponse(content={"total": 0, "basis": "error loading channels"})


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


@router.post("/sync/reset-table")
def reset_table(body: dict) -> dict:
    """Clear all rows from a table and its dependent tables."""
    table_name = body.get("table_name", "").strip()

    # Allowed tables that can be reset
    allowed_tables = {
        "videos",
        "videos_competitors",
        "playlists",
        "playlist_items",
        "comments",
        "audience",
        "video_analytics",
        "video_traffic_source",
        "video_search_insights",
        "playlist_daily_analytics",
        "channel_analytics",
        "traffic_sources_daily",
    }

    if table_name not in allowed_tables:
        return {"error": f"Table '{table_name}' is not allowed to be reset"}, 400

    # Tables that depend on each parent table
    dependencies = {
        "videos": [
            "video_analytics",
            "video_traffic_source",
            "video_search_insights",
            "comments",
        ],
        "playlists": ["playlist_items", "playlist_daily_analytics"],
    }

    try:
        with get_connection() as conn:
            # Clear dependent tables first (if any)
            for dependent_table in dependencies.get(table_name, []):
                conn.execute(f"DELETE FROM {dependent_table}")

            # Clear the requested table
            conn.execute(f"DELETE FROM {table_name}")
            conn.commit()

        return {"success": True, "message": f"Table '{table_name}' has been cleared"}
    except Exception as e:
        return {"error": str(e)}, 500
