# API Usage Mapping

This file maps Sync page Overview metrics to:
- the DB field/table they come from,
- the sync pull key that populates them,
- and the YouTube API used by backend sync code.

## Overview Metrics (`GET /stats/overview`)

- `Total videos`
  - Stats query: `COUNT(*) FROM videos` (`backend/routes.py`)
  - Populated by sync pull: `videos`
  - Sync function: `sync_videos()` (`backend/src/sync.py`)
  - API used: YouTube Data API v3
  - Calls:
    - `channels.list` (resolve uploads playlist)
    - `playlistItems.list` (iterate uploads playlist video IDs)
    - `videos.list` (fetch video metadata/details)
  - Code: `backend/src/youtube/videos.py`

- `Total playlists`
  - Stats query: `COUNT(*) FROM playlists` (`backend/routes.py`)
  - Populated by sync pull: `playlists`
  - Sync function: `sync_playlists()` (`backend/src/sync.py`)
  - API used: YouTube Data API v3
  - Calls:
    - `playlists.list` (playlist metadata)
    - `playlistItems.list` (items per playlist)
  - Code: `backend/src/youtube/playlists.py`

- `Total comments`
  - Stats query: `COUNT(*) FROM comments` (`backend/routes.py`)
  - Populated by sync pull: `comments`
  - Sync function: `sync_comments()` (`backend/src/sync.py`)
  - API used: YouTube Data API v3
  - Calls:
    - `commentThreads.list` (top-level comments per video)
  - Code: `backend/src/youtube/comments.py`

- `Video analytics rows`
  - Stats query: `COUNT(*) FROM daily_analytics` (`backend/routes.py`)
  - Populated by sync pull: `video_analytics` (legacy alias: `daily_analytics`)
  - Sync function: `sync_video_analytics()` (`backend/src/sync.py`)
  - API used: YouTube Analytics API v2
  - Calls:
    - `reports.query` with `filters=video==<video_id>` and `dimensions=day`
  - Code: `backend/src/youtube/analytics.py`

- `Channel analytics rows`
  - Stats query: `COUNT(*) FROM channel_daily_analytics` (`backend/routes.py`)
  - Populated by sync pull: `channel_analytics` (legacy alias: `channel_daily`)
  - Sync function: `sync_channel_analytics()` (`backend/src/sync.py`)
  - API used: YouTube Analytics API v2
  - Calls:
    - `reports.query` with `dimensions=day` (channel scope)
  - Code: `backend/src/youtube/analytics.py`

- `Playlist analytics rows`
  - Stats query: `COUNT(*) FROM playlist_daily_analytics` (`backend/routes.py`)
  - Populated by sync pull: `playlist_analytics`
  - Sync function: `sync_playlist_analytics()` (`backend/src/sync.py`)
  - API used: YouTube Analytics API v2
  - Calls:
    - `reports.query` with `filters=playlist==<playlist_id>`, `dimensions=day`, metrics:
      - `playlistViews`
      - `playlistEstimatedMinutesWatched`
      - `playlistAverageViewDuration`
      - `playlistStarts`
      - `viewsPerPlaylistStart`
      - `averageTimeInPlaylist`
  - Code:
    - Fetch helper: `fetch_playlist_daily_metrics()` in `backend/src/youtube/analytics.py`
    - Upsert: `upsert_playlist_daily_analytics()` in `backend/src/database/playlist_daily.py`

- `Traffic source rows`
  - Stats query: `COUNT(*) FROM traffic_sources_daily` (`backend/routes.py`)
  - Populated by sync pull: `traffic`
  - Sync function: `sync_traffic_sources()` (`backend/src/sync.py`)
  - API used: YouTube Analytics API v2
  - Calls:
    - `reports.query` with `dimensions=day,insightTrafficSourceType`
  - Code: `backend/src/youtube/analytics.py`
  
