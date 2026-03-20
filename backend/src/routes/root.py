"""Root API endpoints."""

from __future__ import annotations

from fastapi import APIRouter

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
        "views": stats.get("viewCount"),
        "subscriber_count": stats.get("subscriberCount"),
        "video_count": stats.get("videoCount"),
    }
