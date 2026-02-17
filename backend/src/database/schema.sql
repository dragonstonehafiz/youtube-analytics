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

CREATE INDEX IF NOT EXISTS idx_playlist_items_playlist ON playlist_items(playlist_id);
CREATE INDEX IF NOT EXISTS idx_playlist_items_video ON playlist_items(video_id);
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

CREATE INDEX IF NOT EXISTS idx_video_analytics_date ON video_analytics(date);
CREATE INDEX IF NOT EXISTS idx_video_analytics_video ON video_analytics(video_id);

CREATE TABLE IF NOT EXISTS video_traffic_source (
    video_id TEXT NOT NULL,
    date TEXT NOT NULL,
    traffic_source TEXT NOT NULL,
    views INTEGER,
    watch_time_minutes REAL,
    PRIMARY KEY (video_id, date, traffic_source),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_video_traffic_source_date ON video_traffic_source(date);
CREATE INDEX IF NOT EXISTS idx_video_traffic_source_video ON video_traffic_source(video_id);
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

CREATE INDEX IF NOT EXISTS idx_video_search_insights_date ON video_search_insights(date);
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

CREATE INDEX IF NOT EXISTS idx_playlist_daily_date ON playlist_daily_analytics(date);
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

CREATE INDEX IF NOT EXISTS idx_channel_analytics_date ON channel_analytics(date);
CREATE INDEX IF NOT EXISTS idx_traffic_sources_date ON traffic_sources_daily(date);

CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    error TEXT,
    error_message TEXT,
    start_date TEXT,
    end_date TEXT,
    deep_sync INTEGER DEFAULT 0,
    pulls TEXT
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

CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id);
CREATE INDEX IF NOT EXISTS idx_comments_author_channel ON comments(author_channel_id);

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

CREATE INDEX IF NOT EXISTS idx_audience_subscriber ON audience(is_public_subscriber);

