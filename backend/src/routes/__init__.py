"""API routes organized by domain."""

from fastapi import APIRouter

from src.routes import analytics, audience, comments, playlists, stats, sync, videos

# Create main router
router = APIRouter()

# Include all domain routers
router.include_router(sync.router, tags=["sync"])
router.include_router(videos.router, tags=["videos"])
router.include_router(playlists.router, tags=["playlists"])
router.include_router(audience.router, tags=["audience"])
router.include_router(comments.router, tags=["comments"])
router.include_router(analytics.router, tags=["analytics"])
router.include_router(stats.router, tags=["stats"])
