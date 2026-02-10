# Repo Note

Keep this file updated as the project evolves. If you add or change backend/frontend behavior, update this file in the same PR.

## Project Overview
This repo has two main parts:
1. Backend API (FastAPI + SQLite) under `backend/`.
2. Frontend app (React + TypeScript) under `frontend/`.

Use this file to understand where to make changes and which conventions to follow.

## Backend Conventions
- Backend lives under `backend/` with FastAPI.
- Config is `.env`-driven via `backend/config.py`.
- SQLite DB file path is `backend/data/youtube.db` (from `DB_PATH=data/youtube.db` in `backend/.env`).
- Database schema and helpers live in `backend/src/database/`.
- YouTube API helpers live in `backend/src/youtube/`.
- Sync orchestration lives in `backend/src/sync.py`.
- Logs should use `backend/utils/logger.py` and write to `backend/outputs/`.
- Add comments when API behavior or non-obvious logic needs explanation (YouTube API params, pagination, resume logic).
- Prefer single-line calls when short; use multi-line only for long argument lists or readability.
- Do not start chained calls on a new line; keep `.method()` on the same line as the object.
- Add docstrings to all functions that explain purpose and return/output.

## Frontend Conventions
- Frontend lives under `frontend/`.
- Framework is React + TypeScript (Vite).
- Use `npm run dev` or `npm run start` for local dev.
- Keep API calls in a small client module (e.g., `frontend/src/api.ts`) and type responses.
- Prefer reusable components over inline UI duplication.
- Shared color theme lives in `frontend/src/index.css` as CSS variables.
- On `frontend/src/pages/SyncSettings.tsx`, overview date fields (`Earliest data`, `Latest data`) are displayed as `day month year` (e.g., `7 February 2026`) instead of raw `yyyy-mm-dd`.
- `frontend/src/pages/SyncSettings.tsx` period selector includes `From Latest Date`, which sets `start_date` to overview `latest_date` and `end_date` to today when triggering sync.
- `GET /stats/overview` now includes `table_storage` with per-table `{table, bytes, percent}` values, where bytes include table + index pages from SQLite `dbstat`.
- `frontend/src/pages/SyncSettings.tsx` uses a 4-column Database Overview layout:
  - Column 1: Database size + donut chart (ring only) with total size in the center.
  - Column 2: Earliest data (top), Latest data (bottom).
  - Column 3: Total videos (top), Total comments (bottom).
  - Column 4: Daily analytics rows, Channel daily rows, Traffic source rows.
  - Donut slices show table size and percent on hover; no persistent table list below the chart.
- `frontend/src/pages/Videos.tsx` includes a separate filter section/card above the videos table section with search, visibility, type (`All videos`, `Longform`, `Shorts`), and published date range inputs. Filters auto-apply on change, are sent to `GET /videos` query params, and are persisted in local storage.
- `frontend/src/pages/Videos.tsx` filter controls use shared UI components where applicable: `Dropdown` for visibility/type and `DateRangePicker` for the published range.
- `frontend/src/pages/Videos.tsx` videos table columns are `Video`, `Visibility`, `Date`, `Views`, `Comments`, `Likes` (no `Restrictions` column).
- `GET /videos` supports `content_type` filtering (`video` for longform, `short` for shorts).
- Video `content_type` classification in `backend/src/database/videos.py` uses short-video IDs from the `UUSH...`-derived playlist (`backend/src/youtube/videos.py`) instead of stream dimensions/thumbnail heuristics.
- `sync_videos` (and the videos pull inside `sync_all`) fetches shorts IDs via `get_short_video_ids()` and passes them to `upsert_videos(..., short_video_ids=...)`; if shorts ID retrieval fails, videos sync fails (fail-fast behavior).
- `sync_channel_daily` writes a single combined channel-daily series to `channel_daily_analytics` (one row per day).
- `GET /analytics/channel-daily` returns the single combined channel-daily series.
- `frontend/src/pages/Analytics.tsx` chart range is trimmed to the first/last day that has channel-daily data within the selected range, while still rendering zero-value gaps for missing days inside that trimmed span.
- `GET /analytics/daily/summary` supports optional `content_type` (`video` or `short`) and aggregates from `daily_analytics` joined to `videos`.
- `frontend/src/pages/Analytics.tsx` includes a content dropdown with `All Videos`, `Longform`, `Shortform`; `All Videos` uses `/analytics/channel-daily`, while `Longform`/`Shortform` use `/analytics/daily/summary?content_type=...` for the same chart component.
- `frontend/src/pages/Analytics.tsx` includes a granularity dropdown for chart aggregation: `Daily`, `7-days`, `28-days`, `90-days`, `Monthly`, `Yearly`. Aggregation is done in frontend from daily series data.
- `GET /videos/published` supports optional `content_type` (`video` or `short`), and `frontend/src/pages/Analytics.tsx` applies the same content dropdown to upload indicators (All = all uploads, Longform = only longform uploads, Shortform = only short uploads).
- `GET /analytics/top-content` supports optional `content_type` (`video` or `short`), and `frontend/src/pages/Analytics.tsx` applies the same content dropdown to `Top content this period`.
- Upload indicators on the Analytics chart are rebucketed to match selected granularity (`Daily`, `7-days`, `28-days`, `90-days`, `Monthly`, `Yearly`) using the same day-bucket mapping as the graph.
- Grouped upload-indicator tooltip headers show bucket start date, end date, and window length (days), plus published count.
- `frontend/src/components/analytics/TopContentTable.tsx` includes an `Upload date` column for top-content rows, shown as a readable date (e.g., `February 3, 2026`).
- `GET /videos/published` includes `content_type` per published item, and `frontend/src/components/analytics/MetricChartCard.tsx` uses it for upload indicators: both shorts and normal videos use the play marker icon, with type-specific marker color. When a clustered bucket contains both types, it renders two adjacent markers (short + video) instead of one mixed marker.
- Upload-marker tooltips in `frontend/src/components/analytics/MetricChartCard.css` use a fixed width (`260px`) so tooltip width stays consistent regardless of title length.

## Frontend Components
- `frontend/src/components/ui/ActionButton.tsx`: Standard button styling. Supports `primary` and `soft` variants.
- `frontend/src/components/ui/DateRangePicker.tsx`: Two-date input with a visual separator for custom ranges.
- `frontend/src/components/ui/Dropdown.tsx`: Custom dropdown used for range selectors.
- `frontend/src/components/ui/MultiSelect.tsx`: Custom multiselect for choosing sync targets.
- `frontend/src/components/ui/YearInput.tsx`: Numeric year input for year-only syncs.
- `frontend/src/components/ui/ProgressBar.tsx`: Horizontal progress bar with optional step text.
- `frontend/src/components/layout/PageCard.tsx`: Generic card wrapper for consistent layout blocks.
- `frontend/src/components/analytics/MetricChartCard.tsx`: Analytics KPI + chart card for the Analytics page.
- `frontend/src/components/analytics/TopContentTable.tsx`: Top content table for analytics summaries.
- Component barrels live in:
  - `frontend/src/components/ui/index.ts`
  - `frontend/src/components/analytics/index.ts`
  - `frontend/src/components/layout/index.ts`
