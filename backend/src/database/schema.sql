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
    content_type TEXT,
    updated_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS daily_analytics (
    video_id TEXT NOT NULL,
    date TEXT NOT NULL,
    views INTEGER,
    watch_time_minutes REAL,
    estimated_revenue REAL,
    average_view_duration_seconds REAL,
    likes INTEGER,
    comments INTEGER,
    shares INTEGER,
    subscribers_gained INTEGER,
    subscribers_lost INTEGER,
    PRIMARY KEY (video_id, date),
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_daily_analytics_date ON daily_analytics(date);
CREATE INDEX IF NOT EXISTS idx_daily_analytics_video ON daily_analytics(video_id);

CREATE TABLE IF NOT EXISTS channel_daily_analytics (
    date TEXT PRIMARY KEY,
    views INTEGER,
    watch_time_minutes REAL,
    estimated_revenue REAL,
    average_view_duration_seconds REAL,
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

CREATE INDEX IF NOT EXISTS idx_channel_daily_date ON channel_daily_analytics(date);
CREATE INDEX IF NOT EXISTS idx_traffic_sources_date ON traffic_sources_daily(date);

CREATE TABLE IF NOT EXISTS sync_runs (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,
    finished_at TEXT,
    status TEXT NOT NULL,
    error_message TEXT,
    start_date TEXT,
    end_date TEXT,
    deep_sync INTEGER DEFAULT 0,
    pulls TEXT
);

CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    video_id TEXT NOT NULL,
    parent_id TEXT,
    reply_count INTEGER,
    author_name TEXT,
    author_channel_id TEXT,
    author_profile_image_url TEXT,
    text_display TEXT,
    like_count INTEGER,
    published_at TEXT,
    updated_at TEXT,
    FOREIGN KEY (video_id) REFERENCES videos(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_comments_video ON comments(video_id);
