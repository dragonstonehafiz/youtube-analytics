"""API routes organized by domain."""

from fastapi import APIRouter

from src.routes import analytics, audience, channels, comments, discovery, insights, llm, outliers, playlists, root, stats, sync, videos

# Create main router
router = APIRouter()

# Include all domain routers
router.include_router(root.router)
router.include_router(sync.router, tags=["sync"])
router.include_router(videos.router, tags=["videos"])
router.include_router(playlists.router, tags=["playlists"])
router.include_router(audience.router, tags=["audience"])
router.include_router(comments.router, tags=["comments"])
router.include_router(analytics.router, tags=["analytics"])
router.include_router(outliers.router, tags=["outliers"])
router.include_router(insights.router, tags=["insights"])
router.include_router(discovery.router, tags=["discovery"])
router.include_router(stats.router, tags=["stats"])
router.include_router(llm.router, tags=["llm"])
router.include_router(channels.router, tags=["channels"])
