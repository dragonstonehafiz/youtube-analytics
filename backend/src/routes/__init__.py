"""API routes organized by domain."""

from fastapi import APIRouter

from src.routes import analytics, audience, channels, comments, llm, playlists, stats, sync, videos
from src.routes import channel_analytics, video_analytics, playlist_analytics, channel_traffic_sources, video_traffic_source, video_search_insights

# Create main router
router = APIRouter()

# Include all domain routers
router.include_router(sync.router, tags=["sync"])
router.include_router(videos.router, tags=["videos"])
router.include_router(playlists.router, tags=["playlists"])
router.include_router(audience.router, tags=["audience"])
router.include_router(comments.router, tags=["comments"])
router.include_router(analytics.router, tags=["analytics"])
router.include_router(channel_analytics.router, tags=["analytics"])
router.include_router(video_analytics.router, tags=["analytics"])
router.include_router(playlist_analytics.router, tags=["analytics"])
router.include_router(channel_traffic_sources.router, tags=["analytics"])
router.include_router(video_traffic_source.router, tags=["analytics"])
router.include_router(video_search_insights.router, tags=["analytics"])
router.include_router(stats.router, tags=["stats"])
router.include_router(llm.router, tags=["llm"])
router.include_router(channels.router, tags=["channels"])
