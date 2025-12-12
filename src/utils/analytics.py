from __future__ import annotations

import subprocess
import sys
import time
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path
from typing import Any, Sequence

import pandas as pd
from googleapiclient.errors import HttpError

SRC_DIR = Path(__file__).resolve().parents[1]
CLI_SCRIPTS_DIR = SRC_DIR / "cli-scripts"


@dataclass(frozen=True)
class DateRange:
    start: str
    end: str


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


def ensure_video_metadata(csv_path: Path, generator_script: Path | None = None) -> pd.DataFrame:
    if csv_path.exists():
        return pd.read_csv(csv_path)
    if generator_script is None:
        generator_script = CLI_SCRIPTS_DIR / "video_data.py"
    print(f"Video metadata cache not found at {csv_path}. Generating via {generator_script.name}...")
    try:
        subprocess.run(
            [sys.executable, str(generator_script), "--output", str(csv_path)],
            check=True,
        )
    except subprocess.CalledProcessError as error:
        raise RuntimeError("Failed to generate video metadata via video_data.py") from error
    if not csv_path.exists():
        raise RuntimeError(f"video_data.py completed but {csv_path} is still missing.")
    return pd.read_csv(csv_path)


def extract_video_ids_and_earliest(metadata_df: pd.DataFrame) -> tuple[list[str], str | None]:
    if "video_id" not in metadata_df.columns:
        return [], None
    video_ids = (
        metadata_df["video_id"]
        .dropna()
        .astype(str)
        .unique()
        .tolist()
    )
    earliest_date: str | None = None
    if "published_at" in metadata_df.columns:
        published = pd.to_datetime(metadata_df["published_at"], errors="coerce").dropna()
        if not published.empty:
            earliest_date = published.min().date().isoformat()
    return video_ids, earliest_date


def build_video_publish_map(metadata_df: pd.DataFrame) -> dict[str, str]:
    publish_map: dict[str, str] = {}
    if {"video_id", "published_at"}.issubset(metadata_df.columns):
        for _, row in metadata_df.dropna(subset=["video_id", "published_at"]).iterrows():
            video_id = str(row["video_id"])
            published_raw = str(row["published_at"])
            if not video_id or not published_raw:
                continue
            publish_date = published_raw.split("T", 1)[0]
            publish_map[video_id] = publish_date
    return publish_map


def fetch_daily_metrics_per_video(
    analytics_service,
    video_ids: Sequence[str],
    start_date: str,
    end_date: str,
    max_results: int = 200,
    append_path: Path | None = None,
    progress: Any | None = None,
    publish_map: dict[str, str] | None = None,
) -> tuple[list[dict[str, Any]], list[list[Any]]]:
    aggregated_rows: list[list[Any]] = []
    metric_headers: list[dict[str, Any]] | None = None
    for index, video_id in enumerate(video_ids, start=1):
        if progress is not None:
            progress.update(1)
        effective_start = start_date
        if publish_map:
            published = publish_map.get(video_id)
            if published and published > end_date:
                continue
            if published and published > start_date:
                effective_start = published
        request_params = {
            "ids": "channel==MINE",
            "startDate": effective_start,
            "endDate": end_date,
            "metrics": "views,estimatedMinutesWatched,estimatedRevenue",
            "dimensions": "day",
            "filters": f"video=={video_id}",
            "maxResults": max_results,
            "startIndex": 1,
        }
        while True:
            current_params = dict(request_params)
            response = None
            max_attempts = 5
            for attempt in range(1, max_attempts + 1):
                try:
                    response = analytics_service.reports().query(**current_params).execute()
                    break
                except HttpError as error:
                    status = getattr(error, "resp", None)
                    status_code: int | None = None
                    if status is not None:
                        try:
                            status_code = int(getattr(status, "status", None))
                        except (TypeError, ValueError):
                            status_code = None
                    error_text = ""
                    try:
                        if error.content:
                            error_text = error.content.decode("utf-8")
                    except Exception:
                        error_text = str(error)
                    if not error_text:
                        error_text = str(error)
                    is_rate_limit = any(token in error_text for token in ("rateLimitExceeded", "quotaExceeded"))
                    should_retry = False
                    if status_code is not None:
                        if status_code >= 500:
                            should_retry = True
                        elif status_code in {403, 429} and is_rate_limit:
                            should_retry = True
                    if should_retry and attempt < max_attempts:
                        sleep_seconds = min(2 ** (attempt - 1), 30)
                        reason = "rate limit" if is_rate_limit else f"HTTP {status_code}"
                        print(
                            (
                                f"  Encountered {reason} for video {video_id} "
                                f"(startIndex {current_params['startIndex']}, attempt {attempt}/{max_attempts}). "
                                f"Retrying in {sleep_seconds:.1f}s..."
                            )
                        )
                        time.sleep(sleep_seconds)
                        continue
                    print(
                        (
                            f"  Request failed for video {video_id} at startIndex {current_params['startIndex']}: "
                            f"{error}"
                        ),
                        file=sys.stderr,
                    )
                    response = None
                    break
            if response is None:
                break
            rows = response.get("rows", [])
            if metric_headers is None:
                metric_headers = response.get("columnHeaders", [])
            rows_with_video = [[video_id, *row] for row in rows]
            aggregated_rows.extend(rows_with_video)
            if append_path:
                append_rows_to_cache(
                    [{"name": "video"}, *(metric_headers or [])],
                    rows_with_video,
                    append_path,
                )
            if len(rows) < max_results:
                break
            request_params["startIndex"] += max_results
            time.sleep(0.2)
    if not aggregated_rows or metric_headers is None:
        return [], []
    headers = [{"name": "video"}, *metric_headers]
    return headers, aggregated_rows


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


def append_rows_to_cache(headers: Sequence[dict[str, Any]], rows: Sequence[Sequence[Any]], cache_path: Path | None) -> None:
    if cache_path is None or not rows:
        return
    df = rows_to_dataframe(headers, rows)
    if df.empty:
        return
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    write_header = not cache_path.exists()
    mode = "a" if cache_path.exists() else "w"
    df.to_csv(cache_path, mode=mode, header=write_header, index=False)
