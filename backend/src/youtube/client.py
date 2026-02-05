from __future__ import annotations

from googleapiclient.discovery import build

from src.youtube.auth import get_credentials


def get_youtube_client():
    creds = get_credentials()
    return build("youtube", "v3", credentials=creds)


def get_analytics_client():
    creds = get_credentials()
    return build("youtubeAnalytics", "v2", credentials=creds)
