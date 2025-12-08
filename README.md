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

## Video catalog export

To capture one metadata row per upload (ID, titles, publish dates, status, statistics, etc.), run:

```
python src/cli-scripts/video_data.py [--output path/to/video_data.csv]
```

By default the script writes `data/video_data_<timestamp>.csv` (timestamp = current local time). Use this file to keep a canonical list of every video
independent of day-by-day analytics.
