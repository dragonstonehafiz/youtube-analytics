"""Channel management API endpoints."""

from __future__ import annotations

import json
import pickle
import random

from fastapi import APIRouter, Query

from src.database.db import get_connection, row_to_dict, ensure_authenticated_channel_in_database
from src.database.channels import get_all_channels, upsert_channel, delete_channel
from src.utils.embeddings import get_embedding_model
from src.utils.logger import get_logger
from src.youtube.channels import get_channel_info

router = APIRouter()
_logger = get_logger("channels")


@router.get("/channels")
def get_channels() -> dict:
    """Return all tracked channels (excluding own channel) with row counts from videos_competitors table."""
    try:
        # Ensure authenticated channel is in database
        ensure_authenticated_channel_in_database()

        with get_connection() as conn:
            channels = get_all_channels(conn)
            result = {}

            # Add row counts from videos_competitors table, exclude own channel (is_own=1)
            for channel in channels:
                if channel.get("is_own"):
                    # Skip own channel - not visible to frontend
                    continue
                channel_id = channel.get("channel_id")
                row_count = conn.execute(
                    "SELECT COUNT(*) FROM videos_competitors WHERE channel_id = ?",
                    (channel_id,),
                ).fetchone()[0]
                channel["row_count"] = row_count
                result[channel_id] = channel

            return result
    except Exception as exc:
        _logger.error(f"Failed to get channels: {exc}", exc_info=True)
        return {}


@router.get("/channels/videos")
def list_channel_videos(
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
    """Return channel videos with optional filters and pagination."""
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


@router.get("/channels/related-videos")
def get_related_videos(
    title: str = Query(default="", description="Video title to find related videos for"),
    limit: int = Query(default=20, ge=1, le=100),
    content_type: str = Query(default="all", description="Filter by content type: all, video, or short"),
) -> dict:
    """Return own and channel videos semantically similar to a given title for thumbnail testing."""
    try:
        with get_connection() as conn:
            where_clauses = []
            params: list[object] = []

            if content_type and content_type != "all":
                where_clauses.append("content_type = ?")
                params.append(content_type)

            where_sql = "WHERE " + " AND ".join(where_clauses) if where_clauses else ""

            if not title or not title.strip():
                # Get all my videos and channel videos, group and return random
                own_videos = conn.execute(
                    f"SELECT * FROM videos {where_sql}",
                    tuple(params),
                ).fetchall()

                channel_videos = conn.execute(
                    f"SELECT * FROM videos_competitors {where_sql}",
                    tuple(params),
                ).fetchall()

                all_videos = list(own_videos) + list(channel_videos)
                selected_rows = random.sample(all_videos, min(limit, len(all_videos)))
                return {"items": [row_to_dict(row) for row in selected_rows], "total": len(selected_rows)}

            # Embed title and batch check embeddings of all videos
            own_video_rows = conn.execute(
                f"SELECT id, title, title_embedding FROM videos {where_sql}",
                tuple(params),
            ).fetchall()

            channel_video_rows = conn.execute(
                f"SELECT id, title, title_embedding FROM videos_competitors {where_sql}",
                tuple(params),
            ).fetchall()

            all_rows = list(own_video_rows) + list(channel_video_rows)

            if not all_rows:
                return {"items": [], "total": 0}

            embedding_model = get_embedding_model()
            query_embedding = embedding_model.embed(title)

            # Mark rows as own or channel, then batch unpickle embeddings
            own_ids = {row["id"] for row in own_video_rows}
            embeddings_data = [
                (row, row["id"] in own_ids, pickle.loads(row["title_embedding"]))
                for row in all_rows
                if row["title_embedding"]
            ]

            valid_rows = [(r[0], r[1]) for r in embeddings_data]
            embeddings = [r[2] for r in embeddings_data]

            # Batch compute similarities
            if embeddings:
                similarities = embedding_model.similarity_batch(query_embedding, embeddings)
                scored_rows = list(zip(valid_rows, similarities))
            else:
                scored_rows = []

            # Group by similarity score bands, best first (keep is_own flag)
            bands = [
                [(r[0], r[1]) for r, sim in scored_rows if sim >= 0.9],
                [(r[0], r[1]) for r, sim in scored_rows if 0.8 <= sim < 0.9],
                [(r[0], r[1]) for r, sim in scored_rows if 0.7 <= sim < 0.8],
                [(r[0], r[1]) for r, sim in scored_rows if 0.5 <= sim < 0.7],
                [(r[0], r[1]) for r, sim in scored_rows if r[1] < 0.5],
            ]

            # Fill up to limit, capping own videos at 10% of limit
            max_own_videos = max(1, int(limit * 0.1))
            own_count = 0
            selected_rows = []

            for band in bands:
                if len(selected_rows) >= limit:
                    break

                # Separate own and channel videos in this band
                own_band = [row for row, is_own in band if is_own]
                channel_band = [row for row, is_own in band if not is_own]

                remaining = limit - len(selected_rows)
                can_take_own = max(0, max_own_videos - own_count)

                # Prioritize channel videos
                sample_channel = min(remaining, len(channel_band))
                if sample_channel > 0:
                    selected_rows.extend(random.sample(channel_band, sample_channel))

                remaining = limit - len(selected_rows)

                # Then own videos up to cap
                sample_own = min(remaining, can_take_own, len(own_band))
                if sample_own > 0:
                    selected_rows.extend(random.sample(own_band, sample_own))
                    own_count += sample_own

            # Fetch full video data from both tables
            if selected_rows:
                row_ids = [row["id"] for row in selected_rows]
                placeholders = ",".join("?" * len(row_ids))

                own_full_rows = conn.execute(
                    f"""
                    SELECT v.*, c.thumbnail_url AS channel_avatar_url
                    FROM videos v
                    LEFT JOIN channels c ON c.channel_id = v.channel_id
                    WHERE v.id IN ({placeholders})
                    """,
                    row_ids,
                ).fetchall()

                channel_full_rows = conn.execute(
                    f"""
                    SELECT vc.*, c.thumbnail_url AS channel_avatar_url
                    FROM videos_competitors vc
                    LEFT JOIN channels c ON c.channel_id = vc.channel_id
                    WHERE vc.id IN ({placeholders})
                    """,
                    row_ids,
                ).fetchall()

                rows_by_id = {row["id"]: row for row in own_full_rows}
                rows_by_id.update({row["id"]: row for row in channel_full_rows})
                rows = [rows_by_id[rid] for rid in row_ids if rid in rows_by_id]
            else:
                rows = []

            return {"items": [row_to_dict(row) for row in rows], "total": len(rows)}
    except Exception as exc:
        _logger.error(f"Failed to get related videos: {exc}", exc_info=True)
        return {"items": [], "total": 0}



@router.delete("/channels/{channel_id}")
def delete_channel_route(channel_id: str) -> dict:
    """Delete channel from database and all its videos."""
    try:
        with get_connection() as conn:
            # Delete videos for this channel
            conn.execute("DELETE FROM videos_competitors WHERE channel_id = ?", (channel_id,))
            # Delete channel metadata
            delete_channel(conn, channel_id)
        return {"success": True}
    except Exception as exc:
        _logger.error(f"Failed to delete channel {channel_id}: {exc}", exc_info=True)
        return {"error": str(exc)}, 500


@router.put("/channels")
def update_channels(body: dict) -> dict:
    """Add/update channels in the database.

    Args:
        body: Dict with channel_id as key, containing {'label': str, 'channel_id': str}
              Will fetch full metadata from YouTube API and store in database.
    """
    try:
        with get_connection() as conn:
            for key, config in body.items():
                if isinstance(config, dict) and config.get("channel_id"):
                    channel_id = config.get("channel_id")
                    try:
                        # Fetch full channel info from YouTube API
                        channel_info = get_channel_info(channel_id)
                        # Override label if provided in body
                        if config.get("label"):
                            channel_info["label"] = config["label"]
                        # Store in database
                        upsert_channel(conn, channel_info)
                    except Exception as exc:
                        _logger.error(f"Failed to save channel {channel_id}: {exc}", exc_info=True)
                        return {"error": f"Failed to fetch channel {channel_id}: {exc}"}

        return {"success": True}
    except Exception as exc:
        _logger.error(f"Failed to update channels: {exc}", exc_info=True)
        return {"error": f"Failed to update channels: {exc}"}
