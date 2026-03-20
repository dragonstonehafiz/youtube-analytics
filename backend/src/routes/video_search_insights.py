from __future__ import annotations

from fastapi import APIRouter
from src.database.video_search_insights import get_search_term_videos, get_top_search_terms

router = APIRouter()


@router.get("/analytics/video-search-insights")
def list_top_search_terms(
    start_date: str,
    end_date: str,
    video_ids: str | None = None,
    content_type: str | None = None,
) -> dict:
    """Return top search terms by views from monthly search insights rows."""
    parsed_video_ids = (
        [value.strip() for value in video_ids.split(",") if value and value.strip()]
        if video_ids
        else []
    )
    items = get_top_search_terms(
        start_date=start_date,
        end_date=end_date,
        video_ids=parsed_video_ids if parsed_video_ids else None,
        content_type=content_type,
    )
    return {"items": items}


@router.get("/analytics/video-search-insights/videos")
def list_search_term_videos(
    start_date: str,
    end_date: str,
    search_term: str,
    content_type: str | None = None,
    video_ids: str | None = None,
) -> dict:
    """Return videos for one search term sorted by search-driven views."""
    parsed_video_ids = (
        [value.strip() for value in video_ids.split(",") if value and value.strip()]
        if video_ids
        else []
    )
    items = get_search_term_videos(
        start_date=start_date,
        end_date=end_date,
        search_term=search_term,
        content_type=content_type,
        video_ids=parsed_video_ids if parsed_video_ids else None,
    )
    return {"items": items}
