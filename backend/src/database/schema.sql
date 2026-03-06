PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS videos (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    description TEXT,
    published_at TEXT,
    channel_id TEXT,
    channel_title TEXT,
    privacy_status TEXT,
    made_for_kids INTEGER,
    duration_seconds INTEGER,
    view_count INTEGER,
    like_count INTEGER,
    comment_count INTEGER,
    favorite_count INTEGER,
    thumbnail_url TEXT,
    video_width INTEGER,
    video_height INTEGER,
    content_type TEXT
);

CREATE TABLE IF NOT EXISTS playlists (
    id TEXT PRIMARY KEY,
    title TEXT,
    description TEXT,
    published_at TEXT,
    channel_id TEXT,
    channel_title TEXT,
    privacy_status TEXT,
    item_count INTEGER,
    thumbnail_url TEXT
);

CREATE TABLE IF NOT EXISTS playlist_items (
    id TEXT PRIMARY KEY,
    playlist_id TEXT NOT NULL,
    video_id TEXT,
    position INTEGER,
    title TEXT,
    description TEXT,
    published_at TEXT,
    video_published_at TEXT,
    channel_id TEXT,
    channel_title TEXT,
    privacy_status TEXT,
    thumbnail_url TEXT,
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

-- GET /playlists/{id}/items — filter items by playlist
CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id);
-- top-content CTE path — find videos in a playlist by video_id
CREATE INDEX IF NOT EXISTS idx_playlist_items_video ON playlist_items(video_id);
-- GET /playlists/{id}/items — ordered by position within a playlist
CREATE INDEX IF NOT EXISTS idx_playlist_items_position ON playlist_items(playlist_id, position);

CREATE TABLE IF NOT EXISTS video_analytics (
    video_id TEXT NOT NULL,
    date TEXT NOT NULL,
    engaged_views INTEGER,
    views INTEGER,
    watch_time_minutes REAL,
    estimated_revenue REAL,
    estimated_ad_revenue REAL,
    gross_revenue REAL,
    estimated_red_partner_revenue REAL,
    average_view_duration_seconds REAL,
    average_view_percentage REAL,
    likes INTEGER,
    comments INTEGER,
    shares INTEGER,
    monetized_playbacks INTEGER,
    playback_based_cpm REAL,
    ad_impressions INTEGER,
    cpm REAL,
    subscribers_gained INTEGER,
    subscribers_lost INTEGER,
    PRIMARY KEY (video_id, date),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- GET /analytics/video-daily — fetch all rows for a specific video
CREATE INDEX IF NOT EXISTS idx_video_analytics_video ON video_analytics(video_id);
-- GET /analytics/top-content, /analytics/content-insights — date-range aggregations;
-- includes metric columns so GROUP BY + SUM never needs to touch the main table rows
DROP INDEX IF EXISTS idx_video_analytics_date;
CREATE INDEX IF NOT EXISTS idx_video_analytics_date
    ON video_analytics(date, video_id, views, watch_time_minutes, estimated_revenue,
                       average_view_duration_seconds);

CREATE TABLE IF NOT EXISTS video_traffic_source (
    video_id TEXT NOT NULL,
    date TEXT NOT NULL,
    traffic_source TEXT NOT NULL,
    views INTEGER,
    watch_time_minutes REAL,
    PRIMARY KEY (video_id, date, traffic_source),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- GET /analytics/video-traffic-sources — filter by date range
CREATE INDEX IF NOT EXISTS idx_video_traffic_source_date ON video_traffic_source(date);
-- GET /analytics/video-traffic-sources — fetch all traffic rows for a specific video
CREATE INDEX IF NOT EXISTS idx_video_traffic_source_video ON video_traffic_source(video_id);
-- GET /analytics/traffic-sources — aggregate views by traffic source type
CREATE INDEX IF NOT EXISTS idx_video_traffic_source_type ON video_traffic_source(traffic_source);

CREATE TABLE IF NOT EXISTS video_search_insights (
    video_id TEXT NOT NULL,
    date TEXT NOT NULL,
    search_term TEXT NOT NULL,
    views INTEGER,
    watch_time_minutes REAL,
    CHECK (substr(date, 9, 2) = '01'),
    PRIMARY KEY (video_id, date, search_term),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- GET /analytics/video-search-insights — filter by date range
CREATE INDEX IF NOT EXISTS idx_video_search_insights_date ON video_search_insights(date);
-- GET /analytics/video-search-insights/videos — fetch all search rows for a specific video
CREATE INDEX IF NOT EXISTS idx_video_search_insights_video ON video_search_insights(video_id);

CREATE TABLE IF NOT EXISTS playlist_daily_analytics (
    playlist_id TEXT NOT NULL,
    date TEXT NOT NULL,
    playlist_views INTEGER,
    playlist_estimated_minutes_watched REAL,
    playlist_average_view_duration_seconds REAL,
    playlist_starts INTEGER,
    views_per_playlist_start REAL,
    average_time_in_playlist_seconds REAL,
    PRIMARY KEY (playlist_id, date),
    FOREIGN KEY (playlist_id) REFERENCES playlists(id) ON DELETE CASCADE
);

-- GET /analytics/playlist-daily — filter by date range
CREATE INDEX IF NOT EXISTS idx_playlist_daily_date ON playlist_daily_analytics(date);
-- GET /analytics/playlist-daily — fetch all rows for a specific playlist
CREATE INDEX IF NOT EXISTS idx_playlist_daily_playlist ON playlist_daily_analytics(playlist_id);

CREATE TABLE IF NOT EXISTS channel_analytics (
    date TEXT PRIMARY KEY,
    engaged_views INTEGER,
    views INTEGER,
    watch_time_minutes REAL,
    estimated_revenue REAL,
    estimated_ad_revenue REAL,
    gross_revenue REAL,
    estimated_red_partner_revenue REAL,
    average_view_duration_seconds REAL,
    average_view_percentage REAL,
    likes INTEGER,
    dislikes INTEGER,
    comments INTEGER,
    shares INTEGER,
    monetized_playbacks INTEGER,
    playback_based_cpm REAL,
    ad_impressions INTEGER,
    cpm REAL,
    impressions INTEGER,
    impressions_ctr REAL,
    subscribers_gained INTEGER,
    subscribers_lost INTEGER
);


CREATE TABLE IF NOT EXISTS traffic_sources_daily (
    date TEXT NOT NULL,
    traffic_source TEXT NOT NULL,
    views INTEGER,
    watch_time_minutes REAL,
    PRIMARY KEY (date, traffic_source)
);


CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    start_date TEXT,
    end_date TEXT,
    table_name TEXT NOT NULL,
    deep_sync INTEGER NOT NULL DEFAULT 0,
    total_api_calls INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'running',
    error TEXT
);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    reply_count INTEGER,
    author_name TEXT,
    author_channel_id TEXT,
    author_profile_image_url TEXT,
    text_display TEXT,
    like_count INTEGER,
    published_at TEXT,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

-- GET /comments — filter comments belonging to a specific video
CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id);
-- GET /audience — subquery sums likes/replies per author across all comments;
-- includes metric columns so the aggregation never needs to touch the main table rows
DROP INDEX IF EXISTS idx_comments_author_channel;
CREATE INDEX IF NOT EXISTS idx_comments_author ON comments(author_channel_id, like_count, reply_count);
-- GET /audience/active, GET /comments — date-windowed queries filter by published_at then
-- group by author; includes metric columns to avoid heap access per matched row
DROP INDEX IF EXISTS idx_comments_published_at;
DROP INDEX IF EXISTS idx_comments_published_author;
CREATE INDEX IF NOT EXISTS idx_comments_date ON comments(published_at, author_channel_id, like_count, reply_count);

CREATE TABLE IF NOT EXISTS audience (
    channel_id TEXT PRIMARY KEY,
    display_name TEXT,
    profile_image_url TEXT,
    is_public_subscriber INTEGER NOT NULL DEFAULT 0,
    subscribed_at TEXT,
    first_commented_at TEXT,
    last_commented_at TEXT,
    comment_count INTEGER NOT NULL DEFAULT 0
);

-- GET /audience — filter public subscribers only
CREATE INDEX IF NOT EXISTS idx_audience_subscriber ON audience(is_public_subscriber);

