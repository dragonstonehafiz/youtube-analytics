# youtube-analytics

Export daily YouTube Analytics metrics (views, watch time, estimated revenue) for every
video on the authenticated channel.

## Usage

```
python src/cli-scripts/daily_analytics.py [--start-date YYYY-MM-DD --end-date YYYY-MM-DD]
                                          [--full-history]
                                          [--output path/to/file.csv]
```

- No flags: exports the last 28 complete days.
- `--start-date`/`--end-date`: specify an explicit inclusive range.
- `--full-history`: fetch data starting from the first uploaded video and ending yesterday.
- `--output`: override the default `data/youtube_daily_analytics_<start>_to_<end>.csv` path.
- The script relies on `data/video_data.csv` for video IDs/titles. If that cache is missing it automatically invokes
  `python src/cli-scripts/video_data.py --output data/video_data.csv` to generate it before fetching analytics.
- Requests are chunked into ~4-month blocks to limit YouTube Analytics API errors; the resulting rows are merged into a
  single CSV.
- Each API response is also appended to `data/daily_analytics.csv` so future runs can inspect previously downloaded
  rows. When that cache exists, `--full-history` automatically resumes from the day after the most recent entry.

## Video catalog export

To capture one metadata row per upload (ID, titles, publish dates, status, statistics, etc.), run:

```
python src/cli-scripts/video_data.py [--output path/to/video_data.csv]
```

By default the script writes `data/video_data.csv`. Use this file to keep a canonical list of every video
independent of day-by-day analytics.

## Playlist catalog export

To export metadata for every playlist owned by the authenticated channel:

```
python src/cli-scripts/playlist_data.py [--output path/to/playlist_data.csv]
```

By default the script writes `data/playlist_data.csv`. The CSV contains columns like playlist ID, title,
description, publish time, privacy status, and item counts for each playlist.

## Playlist/video membership export

To generate a row per playlist item (playlist ↔ video relationship):

```
python src/cli-scripts/playlist_video_map.py [--output path/to/playlist_video_map.csv]
```

By default the script writes `data/playlist_video_map.csv` and includes playlist metadata (ID/title) along with
each playlist item’s ID, position, and referenced video ID.
