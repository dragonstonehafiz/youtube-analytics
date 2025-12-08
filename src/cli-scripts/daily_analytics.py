#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
import time
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Callable, Sequence

SRC_DIR = Path(__file__).resolve().parents[1]
if str(SRC_DIR) not in sys.path:
    sys.path.append(str(SRC_DIR))

import pandas as pd
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

from utils.auth import get_credentials
from utils.config import CLIENT_SECRETS_FILE, DATA_DIR, SCOPES, TOKEN_FILE
from utils.youtube import list_channel_video_ids


@dataclass(frozen=True)
class DateRange:
    start: str
    end: str


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
            "Output CSV path. Defaults to data/youtube_daily_analytics_<start>_to_<end>.csv "
            "(directory is created if needed)."
        ),
    )
    return parser.parse_args()


def determine_date_range(
    start: str | None,
    end: str | None,
    use_full_history: bool,
    earliest_upload_date: str | None,
) -> DateRange:
    if use_full_history and (start or end):
        raise ValueError("--full-history cannot be combined with --start-date/--end-date.")
    if bool(start) ^ bool(end):
        raise ValueError("You must supply both --start-date and --end-date, or neither.")
    computed_end = (date.today() - timedelta(days=1)).isoformat()
    if use_full_history:
        if not earliest_upload_date:
            raise ValueError("Unable to determine the first upload date for this channel.")
        return DateRange(start=earliest_upload_date, end=computed_end)
    if start and end:
        return DateRange(start=start, end=end)
    computed_start = (date.fromisoformat(computed_end) - timedelta(days=27)).isoformat()
    return DateRange(start=computed_start, end=computed_end)


def execute_with_retry(
    request_callable: Callable[[], dict[str, Any]],
    *,
    video_id: str,
    start_index: int,
    max_attempts: int = 5,
) -> dict[str, Any] | None:
    for attempt in range(1, max_attempts + 1):
        try:
            return request_callable()
        except HttpError as error:
            status = getattr(error, "resp", None)
            status_code: int | None = None
            if status is not None:
                try:
                    status_code = int(getattr(status, "status", None))
                except (TypeError, ValueError):
                    status_code = None
            if status_code and status_code >= 500:
                if attempt == max_attempts:
                    print(
                        (
                            f"  Giving up on video {video_id} at startIndex {start_index} "
                            f"after {max_attempts} attempts ({status_code})."
                        ),
                        file=sys.stderr,
                    )
                    return None
                sleep_seconds = min(2 ** (attempt - 1), 30)
                print(
                    (
                        f"  Received {status_code} from API for video {video_id} (startIndex {start_index}, "
                        f"attempt {attempt}/{max_attempts}). Retrying in {sleep_seconds:.1f}s..."
                    )
                )
                time.sleep(sleep_seconds)
                continue
            raise
    return None


def fetch_daily_metrics_per_video(
    analytics_service,
    video_ids: Sequence[str],
    start_date: str,
    end_date: str,
    max_results: int = 200,
) -> tuple[list[dict[str, Any]], list[list[Any]]]:
    aggregated_rows: list[list[Any]] = []
    metric_headers: list[dict[str, Any]] | None = None
    for index, video_id in enumerate(video_ids, start=1):
        request_params = {
            "ids": "channel==MINE",
            "startDate": start_date,
            "endDate": end_date,
            "metrics": "views,estimatedMinutesWatched,estimatedRevenue",
            "dimensions": "day",
            "filters": f"video=={video_id}",
            "maxResults": max_results,
            "startIndex": 1,
        }
        while True:
            current_params = dict(request_params)
            response = execute_with_retry(
                lambda: analytics_service.reports().query(**current_params).execute(),
                video_id=video_id,
                start_index=current_params["startIndex"],
            )
            if response is None:
                break
            rows = response.get("rows", [])
            if metric_headers is None:
                metric_headers = response.get("columnHeaders", [])
            for row in rows:
                aggregated_rows.append([video_id, *row])
            if len(rows) < max_results:
                break
            request_params["startIndex"] += max_results
        if index % 50 == 0:
            print(f"  Processed {index} videos so far...")
    if not aggregated_rows or metric_headers is None:
        return [], []
    headers = [{"name": "video"}, *metric_headers]
    return headers, aggregated_rows


def fetch_video_titles(youtube_service, video_ids: Sequence[str]) -> dict[str, str]:
    titles: dict[str, str] = {}
    ids = [video_id for video_id in video_ids if video_id]
    for start in range(0, len(ids), 50):
        batch = ids[start : start + 50]
        response = youtube_service.videos().list(
            part="snippet",
            id=",".join(batch),
            maxResults=50,
        ).execute()
        for item in response.get("items", []):
            titles[item["id"]] = item["snippet"]["title"]
    return titles


def rows_to_dataframe(headers: Sequence[dict[str, Any]], rows: Sequence[Sequence[Any]]) -> pd.DataFrame:
    if not rows:
        return pd.DataFrame()
    ordered_columns = [header["name"] for header in headers]
    df = pd.DataFrame(rows, columns=ordered_columns)
    value_columns = [col for col in df.columns if col not in {"video", "day"}]
    for column in value_columns:
        df[column] = pd.to_numeric(df[column], errors="coerce")
    df = df.rename(
        columns={
            "day": "date",
            "estimatedMinutesWatched": "watch_time_minutes",
            "estimatedRevenue": "estimated_revenue_usd",
        }
    )
    if "date" in df.columns:
        df["date"] = pd.to_datetime(df["date"], errors="coerce").dt.strftime("%Y-%m-%d")
    if "watch_time_minutes" in df.columns:
        df["watch_time_hours"] = (df["watch_time_minutes"] / 60).round(2)
    return df


def determine_output_path(output_arg: str | None, date_range: DateRange) -> Path:
    if output_arg:
        return Path(output_arg)
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    return DATA_DIR / f"youtube_daily_analytics_{date_range.start}_to_{date_range.end}.csv"


def main() -> int:
    args = parse_args()

    credentials = get_credentials(CLIENT_SECRETS_FILE, TOKEN_FILE, SCOPES)
    yt_analytics = build("youtubeAnalytics", "v2", credentials=credentials)
    youtube = build("youtube", "v3", credentials=credentials)

    video_ids, earliest_upload_date = list_channel_video_ids(youtube)
    if not video_ids:
        print("No uploads found for this channel. Confirm the authenticated account owns at least one video.")
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
    print(f"Requesting analytics for {date_range.start} → {date_range.end}")
    print(f"Found {len(video_ids)} uploads. Fetching daily metrics for each video...")

    try:
        headers, rows = fetch_daily_metrics_per_video(
            yt_analytics,
            video_ids,
            date_range.start,
            date_range.end,
        )
    except HttpError as error:
        print(f"Request failed: {error}", file=sys.stderr)
        return 1

    metrics_df = rows_to_dataframe(headers, rows)
    if metrics_df.empty:
        print("No analytics rows were returned for the selected period.")
        return 0

    title_map = fetch_video_titles(youtube, metrics_df["video"].tolist())
    metrics_df["title"] = metrics_df["video"].map(title_map).fillna("<title unavailable>")
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
