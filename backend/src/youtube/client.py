from __future__ import annotations

from googleapiclient.discovery import build

from src.youtube.auth import get_credentials


def get_youtube_client():
    """Return an authenticated YouTube Data API client."""
    creds = get_credentials()
    return build("youtube", "v3", credentials=creds)


def get_analytics_client():
    """Return an authenticated YouTube Analytics API client."""
    creds = get_credentials()
    return build("youtubeAnalytics", "v2", credentials=creds)
