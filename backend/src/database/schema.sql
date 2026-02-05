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
