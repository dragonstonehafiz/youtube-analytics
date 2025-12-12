#!/usr/bin/env python3
from __future__ import annotations

import argparse
import calendar
import sys
from datetime import date, timedelta
from pathlib import Path
from typing import Any

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

import pandas as pd
from googleapiclient.discovery import build
from tqdm.auto import tqdm
from utils.analytics import (
    DateRange,
    build_video_publish_map,
    determine_date_range,
    ensure_video_metadata,
    extract_video_ids_and_earliest,
    fetch_daily_metrics_per_video,
    rows_to_dataframe,
)
from utils.auth import get_credentials
from utils.config import (
    CLIENT_SECRETS_FILE,
    DAILY_ANALYTICS_FILE,
    DATA_DIR,
    SCOPES,
    TOKEN_FILE,
    VIDEO_DATA_FILE,
)


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Export YouTube Analytics daily metrics (views, watch time, earnings) per video."
    )
    parser.add_argument("--start-date", help="ISO date (YYYY-MM-DD). Defaults to 28 days before yesterday.")
    parser.add_argument("--end-date", help="ISO date (YYYY-MM-DD). Defaults to yesterday.")
    parser.add_argument(
        "--full-history",
        action="store_true",
        help="Fetch metrics starting from the first uploaded video (incompatible with --start-date/--end-date).",
    )
    parser.add_argument(
        "--output",
        help=(
            "Output CSV path. Defaults to data/daily_analytics.csv "
            "(directory is created if needed)."
        ),
    )
    return parser.parse_args()


def determine_output_path(output_arg: str | None, date_range: DateRange) -> Path:
    if output_arg:
        return Path(output_arg)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR / "daily_analytics.csv"


def add_months(base_date: date, months: int) -> date:
    month = base_date.month - 1 + months
    year = base_date.year + month // 12
    month = month % 12 + 1
    day = min(base_date.day, calendar.monthrange(year, month)[1])
    return date(year, month, day)


def chunk_date_range(date_range: DateRange, months_per_chunk: int = 4) -> list[DateRange]:
    start = date.fromisoformat(date_range.start)
    end = date.fromisoformat(date_range.end)
    segments: list[DateRange] = []
    current = start
    while current <= end:
        next_start = add_months(current, months_per_chunk)
        segment_end = min(next_start - timedelta(days=1), end)
        segments.append(DateRange(current.isoformat(), segment_end.isoformat()))
        current = segment_end + timedelta(days=1)
    return segments


def determine_resume_start(cache_path: Path, default_start: str) -> str:
    if not cache_path.exists():
        return default_start
    try:
        cache_df = pd.read_csv(cache_path, usecols=["date"])
    except Exception:
        return default_start
    cache_df["date"] = pd.to_datetime(cache_df["date"], errors="coerce")
    cache_df = cache_df.dropna(subset=["date"])
    if cache_df.empty:
        return default_start
    latest_date = cache_df["date"].max().date() + timedelta(days=1)
    computed = latest_date.isoformat()
    return computed if computed > default_start else default_start


def main() -> int:
    args = parse_args()

    credentials = get_credentials(CLIENT_SECRETS_FILE, TOKEN_FILE, SCOPES)
    yt_analytics = build("youtubeAnalytics", "v2", credentials=credentials)

    try:
        video_metadata = ensure_video_metadata(VIDEO_DATA_FILE)
    except RuntimeError as error:
        print(error, file=sys.stderr)
        return 1

    video_ids, earliest_upload_date = extract_video_ids_and_earliest(video_metadata)
    publish_map = build_video_publish_map(video_metadata)
    if not video_ids:
        print("No uploads found in video metadata. Confirm the authenticated account owns at least one video.")
        return 1
    try:
        date_range = determine_date_range(
            args.start_date,
            args.end_date,
            args.full_history,
            earliest_upload_date,
        )
    except ValueError as error:
        print(error, file=sys.stderr)
        return 1
    resume_start = determine_resume_start(DAILY_ANALYTICS_FILE, date_range.start)
    if resume_start > date_range.start:
        print(f"Resuming from {resume_start} based on {DAILY_ANALYTICS_FILE.name}")
        date_range = DateRange(start=resume_start, end=date_range.end)
    print(f"Requesting analytics for {date_range.start} → {date_range.end}")
    print(f"Found {len(video_ids)} uploads. Fetching daily metrics for each video...")

    segments = chunk_date_range(date_range)
    aggregated_headers: list[dict[str, Any]] | None = None
    aggregated_rows: list[list[Any]] = []
    for segment in segments:
        print(f"  Fetching {segment.start} → {segment.end}")
        with tqdm(total=len(video_ids), desc=f"{segment.start} → {segment.end}", unit="video", leave=False) as progress:
            headers, rows = fetch_daily_metrics_per_video(
                yt_analytics,
                video_ids,
                segment.start,
                segment.end,
                append_path=DAILY_ANALYTICS_FILE,
                progress=progress,
                publish_map=publish_map,
            )
        if not rows:
            continue
        if aggregated_headers is None:
            aggregated_headers = headers
        aggregated_rows.extend(rows)

    if not aggregated_rows or aggregated_headers is None:
        print("No analytics rows were returned for the selected period.")
        return 0

    metrics_df = rows_to_dataframe(aggregated_headers, aggregated_rows)

    if {"video_id", "title"}.issubset(video_metadata.columns):
        title_series = video_metadata.dropna(subset=["video_id"]).drop_duplicates("video_id").set_index("video_id")["title"]
        metrics_df["title"] = metrics_df["video"].map(title_series).fillna("<title unavailable>")
    else:
        metrics_df["title"] = "<title unavailable>"
    ordered_columns = [
        "date",
        "title",
        "video",
        "views",
        "watch_time_minutes",
        "watch_time_hours",
        "estimated_revenue_usd",
    ]
    existing_columns = [column for column in ordered_columns if column in metrics_df.columns]
    metrics_df = metrics_df[existing_columns]

    output_path = determine_output_path(args.output, date_range)
    output_path.parent.mkdir(parents=True, exist_ok=True)
    metrics_df.to_csv(output_path, index=False)
    print(f"Saved {len(metrics_df)} rows to {output_path}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
