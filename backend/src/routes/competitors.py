"""Competitor management API endpoints."""

from __future__ import annotations

import json

from fastapi import APIRouter

from src.database.db import get_connection
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
