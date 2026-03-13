"""Competitor management API endpoints."""

from __future__ import annotations

import json
import pickle
import random

from fastapi import APIRouter, Query

from src.database.db import get_connection, row_to_dict
from src.utils.embeddings import get_embedding_model
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


@router.get("/competitors/related-videos")
def get_related_videos(
    title: str = Query(default="", description="Video title to find related videos for"),
    limit: int = Query(default=20, ge=1, le=100),
    content_type: str = Query(default="all", description="Filter by content type: all, video, or short"),
) -> dict:
    """Return own and competitor videos semantically similar to a given title for thumbnail testing."""
    try:
        with get_connection() as conn:
            where_clauses = []
            params: list[object] = []

            if content_type and content_type != "all":
                where_clauses.append("content_type = ?")
                params.append(content_type)

            where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

            if not title or not title.strip():
                # Get all my videos and competitor videos, group and return random
                own_videos = conn.execute(
                    f"SELECT * FROM videos {where_sql}",
                    tuple(params),
                ).fetchall()

                competitor_videos = conn.execute(
                    f"SELECT * FROM videos_competitors {where_sql}",
                    tuple(params),
                ).fetchall()

                all_videos = list(own_videos) + list(competitor_videos)
                selected_rows = random.sample(all_videos, min(limit, len(all_videos)))
                return {"items": [row_to_dict(row) for row in selected_rows], "total": len(selected_rows)}

            # Embed title and batch check embeddings of all videos
            own_video_rows = conn.execute(
                f"SELECT id, title, title_embedding FROM videos {where_sql}",
                tuple(params),
            ).fetchall()

            competitor_video_rows = conn.execute(
                f"SELECT id, title, title_embedding FROM videos_competitors {where_sql}",
                tuple(params),
            ).fetchall()

            all_rows = list(own_video_rows) + list(competitor_video_rows)

            if not all_rows:
                return {"items": [], "total": 0}

            embedding_model = get_embedding_model()
            query_embedding = embedding_model.embed(title)

            # Batch unpickle embeddings
            embeddings_data = [
                (row, pickle.loads(row["title_embedding"]))
                for row in all_rows
                if row["title_embedding"]
            ]

            valid_rows = [r[0] for r in embeddings_data]
            embeddings = [r[1] for r in embeddings_data]

            # Batch compute similarities
            semantic_threshold = 0.5
            if embeddings:
                similarities = embedding_model.similarity_batch(query_embedding, embeddings)
                scored_rows = list(zip(valid_rows, similarities))
            else:
                scored_rows = []

            # Filter by threshold
            above_threshold = [r[0] for r in scored_rows if r[1] >= semantic_threshold]
            below_threshold = [r[0] for r in scored_rows if r[1] < semantic_threshold]

            # Return high similarity videos, fill rest with random from below threshold
            selected_rows = random.sample(above_threshold, min(limit, len(above_threshold)))
            if len(selected_rows) < limit and below_threshold:
                remaining = limit - len(selected_rows)
                selected_rows.extend(random.sample(below_threshold, min(remaining, len(below_threshold))))

            # Fetch full video data from both tables
            if selected_rows:
                row_ids = [row["id"] for row in selected_rows]
                placeholders = ",".join("?" * len(row_ids))

                own_full_rows = conn.execute(
                    f"SELECT * FROM videos WHERE id IN ({placeholders})",
                    row_ids,
                ).fetchall()

                competitor_full_rows = conn.execute(
                    f"SELECT * FROM videos_competitors WHERE id IN ({placeholders})",
                    row_ids,
                ).fetchall()

                rows_by_id = {row["id"]: row for row in own_full_rows}
                rows_by_id.update({row["id"]: row for row in competitor_full_rows})
                rows = [rows_by_id[rid] for rid in row_ids if rid in rows_by_id]
            else:
                rows = []

            return {"items": [row_to_dict(row) for row in rows], "total": len(rows)}
    except Exception as exc:
        return {"error": str(exc)}, 500



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
