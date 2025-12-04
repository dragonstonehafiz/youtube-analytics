#!/usr/bin/env python3
from __future__ import annotations

import argparse
import sys
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Sequence

import pandas as pd
from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow
from googleapiclient.discovery import build
from googleapiclient.errors import HttpError

SCOPES: Sequence[str] = (
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
    "https://www.googleapis.com/auth/youtube.readonly",
)

CLIENT_SECRETS_FILE = Path("secrets/client_secret.json")
TOKEN_FILE = Path("secrets/youtube-token.json")
DATA_DIR = Path("data")


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
        "--output",
        help=(
            "Output CSV path. Defaults to data/youtube_daily_analytics_<start>_to_<end>.csv "
            "(directory is created if needed)."
        ),
    )
    return parser.parse_args()


def determine_date_range(start: str | None, end: str | None) -> DateRange:
    if bool(start) ^ bool(end):
        raise ValueError("You must supply both --start-date and --end-date, or neither.")
    if start and end:
        return DateRange(start=start, end=end)
    computed_end = (date.today() - timedelta(days=1)).isoformat()
    computed_start = (date.fromisoformat(computed_end) - timedelta(days=27)).isoformat()
    return DateRange(start=computed_start, end=computed_end)


def get_credentials(client_secret_file: Path, token_file: Path, scopes: Sequence[str]) -> Credentials:
    if not client_secret_file.exists():
        raise FileNotFoundError(
            f"Client secret file not found at {client_secret_file}. Download it from the Google Cloud console."
        )

    creds: Credentials | None = None
    if token_file.exists():
        creds = Credentials.from_authorized_user_file(token_file, scopes)

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(client_secret_file, scopes)
        creds = flow.run_local_server(port=0, prompt="consent")
        token_file.parent.mkdir(parents=True, exist_ok=True)
        token_file.write_text(creds.to_json())
        print(f"Saved refresh token to {token_file}")
    return creds


def list_channel_video_ids(youtube_service) -> list[str]:
    channels_response = youtube_service.channels().list(part="contentDetails", mine=True).execute()
    items = channels_response.get("items", [])
    if not items:
        return []
    uploads_playlist = items[0]["contentDetails"]["relatedPlaylists"]["uploads"]
    video_ids: list[str] = []
    next_page_token: str | None = None
    while True:
        playlist_response = youtube_service.playlistItems().list(
            part="contentDetails",
            playlistId=uploads_playlist,
            maxResults=50,
            pageToken=next_page_token,
        ).execute()
        for item in playlist_response.get("items", []):
            video_ids.append(item["contentDetails"]["videoId"])
        next_page_token = playlist_response.get("nextPageToken")
        if not next_page_token:
            break
    return video_ids


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
            response = analytics_service.reports().query(**request_params).execute()
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
    date_range = determine_date_range(args.start_date, args.end_date)
    print(f"Requesting analytics for {date_range.start} → {date_range.end}")

    credentials = get_credentials(CLIENT_SECRETS_FILE, TOKEN_FILE, SCOPES)
    yt_analytics = build("youtubeAnalytics", "v2", credentials=credentials)
    youtube = build("youtube", "v3", credentials=credentials)

    video_ids = list_channel_video_ids(youtube)
    if not video_ids:
        print("No uploads found for this channel. Confirm the authenticated account owns at least one video.")
        return 1
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
