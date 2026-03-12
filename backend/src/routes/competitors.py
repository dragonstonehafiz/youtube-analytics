"""Competitor management API endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter, Query

from src.database.db import get_connection, row_to_dict
from config import settings

router = APIRouter()


@router.get("/competitors")
def get_competitors() -> dict:
    """Return competitors config with fresh row counts from videos_competitors table."""
    try:
        competitors_json_path = settings.data_dir / "competitors.json"
        if not competitors_json_path.exists():
            return {}

        with open(competitors_json_path, "r") as f:
            competitors_config = json.load(f)

        # Count rows per channel_id in videos_competitors
        with get_connection() as conn:
            for key, config in competitors_config.items():
                if isinstance(config, dict) and config.get("channel_id"):
                    channel_id = config.get("channel_id")
                    row_count = conn.execute(
                        "SELECT COUNT(*) FROM videos_competitors WHERE channel_id = ?",
                        (channel_id,),
                    ).fetchone()[0]
                    config["row_count"] = row_count

        # Save updated config with fresh counts
        with open(competitors_json_path, "w") as f:
            json.dump(competitors_config, f, indent=2)

        return competitors_config
    except (json.JSONDecodeError, OSError):
        return {}


@router.get("/competitors/videos")
def list_competitor_videos(
    limit: int = Query(default=100, ge=1, le=1000),
    offset: int = Query(default=0, ge=0),
    q: str | None = None,
    channel_id: str | None = None,
    published_after: str | None = None,
    published_before: str | None = None,
    content_type: str | None = None,
    sort: str | None = None,
    direction: str | None = None,
) -> dict:
    """Return competitor videos with optional filters and pagination."""
    where_clauses = []
    params: list[object] = []

    if q:
        where_clauses.append("(title LIKE ? OR id LIKE ?)")
        params.extend([f"%{q}%", f"%{q}%"])
    if channel_id:
        where_clauses.append("channel_id = ?")
        params.append(channel_id)
    if published_after:
        where_clauses.append("published_at >= ?")
        params.append(published_after)
    if published_before:
        where_clauses.append("published_at <= ?")
        params.append(published_before)
    if content_type:
        where_clauses.append("content_type = ?")
        params.append(content_type)

    where_sql = ""
    if where_clauses:
        where_sql = "WHERE " + " AND ".join(where_clauses)

    sort_map = {
        "date": "published_at",
        "views": "view_count",
        "comments": "comment_count",
        "likes": "like_count",
    }
    sort_column = sort_map.get(sort or "", "published_at")
    sort_dir = "ASC" if (direction or "").lower() == "asc" else "DESC"

    with get_connection() as conn:
        rows = conn.execute(
            f"SELECT * FROM videos_competitors {where_sql} ORDER BY {sort_column} {sort_dir} LIMIT ? OFFSET ?",
            tuple(params + [limit, offset]),
        ).fetchall()
        total_row = conn.execute(
            f"SELECT COUNT(*) AS total FROM videos_competitors {where_sql}",
            tuple(params),
        ).fetchone()
        total = total_row["total"] if total_row and total_row["total"] is not None else 0
    return {"items": [row_to_dict(row) for row in rows], "total": total}


@router.delete("/competitors/{channel_id}")
def delete_competitor(channel_id: str) -> dict:
    """Delete all videos for a competitor channel."""
    try:
        with get_connection() as conn:
            conn.execute("DELETE FROM videos_competitors WHERE channel_id = ?", (channel_id,))
            conn.commit()
        return {"success": True}
    except Exception as exc:
        return {"error": str(exc)}, 500


@router.put("/competitors")
def update_competitors(body: dict) -> dict:
    """Update competitors config in competitors.json."""
    competitors_json_path = settings.data_dir / "competitors.json"
    try:
        with open(competitors_json_path, "w") as f:
            json.dump(body, f, indent=2)
        return {"success": True}
    except OSError as exc:
        return {"error": f"Failed to write competitors.json: {exc}"}
