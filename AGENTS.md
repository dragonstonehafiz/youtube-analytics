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
- `GET /stats/overview` `table_storage.percent` is normalized against tracked table bytes only (tables + their indexes), so donut slices sum to 100% of table storage rather than total SQLite file size.
- `frontend/src/pages/SyncSettings.tsx` uses a 4-column Database Overview layout:
  - Column 1: Database size + donut chart (ring only) with total size in the center.
  - Column 2: Earliest data (top), Latest data (bottom).
  - Column 3: Total videos (top), Total comments (bottom).
  - Column 4: Daily analytics rows, Channel daily rows, Traffic source rows.
  - Donut slices show table size and percent on hover; no persistent table list below the chart.
- Sync runs table (`frontend/src/pages/SyncSettings.tsx` + `frontend/src/pages/Page.css`) uses fixed-width grid tracks with ellipsis truncation per cell so row height stays consistent regardless of content length.
- `frontend/src/pages/Videos.tsx` includes a separate filter section/card above the videos table section with search, visibility, type (`All videos`, `Longform`, `Shorts`), and published date range inputs. Filters auto-apply on change, are sent to `GET /videos` query params, and are persisted in local storage.
- Videos and Comments pages share the same filter layout class pattern in `frontend/src/pages/Page.css` using `filter-*` class names (`filter-section`, `filter-title`, `filter-grid`, `filter-field`, `filter-date`, `filter-actions`, `filter-action`).
- `frontend/src/pages/Videos.tsx` filter controls use shared UI components where applicable: `Dropdown` for visibility/type and `DateRangePicker` for the published range.
- `frontend/src/pages/Videos.tsx` videos table columns are `Video`, `Visibility`, `Date`, `Views`, `Comments`, `Likes` (no `Restrictions` column).
- Video detail route path is `frontend` route `/videoDetails/:videoId` (not `/videos/:videoId`).
- `GET /videos` supports `content_type` filtering (`video` for longform, `short` for shorts).
- `GET /videos/{video_id}` returns a single video row for video detail metadata.
- Video `content_type` classification in `backend/src/database/videos.py` uses short-video IDs from the `UUSH...`-derived playlist (`backend/src/youtube/videos.py`) instead of stream dimensions/thumbnail heuristics.
- `sync_videos` (and the videos pull inside `sync_all`) fetches shorts IDs via `get_short_video_ids()` and passes them to `upsert_videos(..., short_video_ids=...)`; if shorts ID retrieval fails, videos sync fails (fail-fast behavior).
- `sync_channel_daily` writes a single combined channel-daily series to `channel_daily_analytics` (one row per day).
- `GET /analytics/channel-daily` returns the single combined channel-daily series.
- `frontend/src/pages/Analytics.tsx` chart range is trimmed to the first/last day that has channel-daily data within the selected range, while still rendering zero-value gaps for missing days inside that trimmed span.
- `GET /analytics/daily/summary` supports optional `content_type` (`video` or `short`) and aggregates from `daily_analytics` joined to `videos`.
- `frontend/src/pages/Analytics.tsx` includes a content dropdown with `All Videos`, `Longform`, `Shortform`; `All Videos` uses `/analytics/channel-daily`, while `Longform`/`Shortform` use `/analytics/daily/summary?content_type=...` for the same chart component.
- `frontend/src/pages/Analytics.tsx` includes a granularity dropdown for chart aggregation: `Daily`, `7-days`, `28-days`, `90-days`, `Monthly`, `Yearly`. Aggregation is done in frontend from daily series data.
- `frontend/src/pages/Analytics.tsx` KPI cards now compare current totals to the immediately previous equal-length date window and show trend indicators (green up/gray down) with text like `X% more/less than previous N days`.
- `frontend/src/pages/Analytics.tsx` now includes a right-side latest-content rail with two reusable cards (`frontend/src/components/analytics/VideoDetailListCard.tsx`): one for longform (`content_type=video`) and one for shorts (`content_type=short`), each sourced from `GET /analytics/top-content` for the selected date range and sorted by newest publish date first.
- `frontend/src/components/analytics/VideoDetailListCard.tsx` is the reusable video-detail list card component (title + arbitrary item list + CTA), and supports per-metric typical-range meters (currently views and average view duration) with up/down trend arrows when the active video is outside the card's typical range.
- `frontend/src/components/analytics/VideoDetailListCard.tsx` supports two CTA buttons: `See video analytics` and optional `See video comments` (wired in Dashboard/Analytics to `/videoDetails/:videoId?tab=comments`).
- On `frontend/src/pages/Analytics.tsx`, only the two latest-content cards request `privacy_status=public` (public videos only). `Top content this period` remains unfiltered by privacy unless content type filtering is applied.
- `GET /videos/published` supports optional `content_type` (`video` or `short`), and `frontend/src/pages/Analytics.tsx` applies the same content dropdown to upload indicators (All = all uploads, Longform = only longform uploads, Shortform = only short uploads).
- `GET /analytics/top-content` supports optional `content_type` (`video` or `short`), and `frontend/src/pages/Analytics.tsx` applies the same content dropdown to `Top content this period`.
- `GET /analytics/top-content` also supports optional sorting via `sort_by` (`views` or `published_at`) and `direction` (`asc`/`desc`).
- `GET /analytics/top-content` also supports optional `privacy_status` filtering (e.g., `public`).
- Upload indicators on the Analytics chart are rebucketed to match selected granularity (`Daily`, `7-days`, `28-days`, `90-days`, `Monthly`, `Yearly`) using the same day-bucket mapping as the graph.
- Grouped upload-indicator tooltip headers show bucket start date, end date, and window length (days), plus published count.
- `frontend/src/components/analytics/TopContentTable.tsx` includes an `Upload date` column for top-content rows, shown as a readable date (e.g., `February 3, 2026`).
- `GET /videos/published` includes `content_type` per published item, and `frontend/src/components/analytics/MetricChartCard.tsx` uses it for upload indicators: both shorts and normal videos use the play marker icon, with type-specific marker color. When a clustered bucket contains both types, it renders two adjacent markers (short + video) instead of one mixed marker.
- Upload-marker tooltips in `frontend/src/components/analytics/MetricChartCard.css` use a fixed width (`260px`) so tooltip width stays consistent regardless of title length.
- `frontend/src/pages/VideoDetail.tsx` renders a metadata card above the Analytics/Comments tab selector and includes video thumbnail + key metadata fields.
- Video detail description preserves line breaks and uses a fixed-height scrollable area when content overflows.
- In video detail metadata card, stats (`Visibility`, `Published`, `Duration`, `Views`, `Likes`, `Comments`) are rendered as a separate row below thumbnail/title/description.
- Video detail `Analytics` tab reuses `frontend/src/components/analytics/MetricChartCard.tsx` and is populated from existing `GET /analytics/daily?video_id=...` data (no extra backend route).
- Video detail `Analytics` tab includes range/granularity controls (no content-type selector): `Daily/7-days/28-days/90-days/Monthly/Yearly` + `Presets/Yearly/Custom range`.
- Video detail analytics control state is shared across all video detail pages via storage keys `videoDetailGranularity` and `videoDetailRange`.
- `GET /comments` supports optional `video_id` filtering, pagination (`limit`, `offset`), and sorting via `sort_by` (`published_at`, `likes`, or `reply_count`) plus `direction` (`asc`/`desc`), returning `{ items, parents, total }`.
- `GET /comments/{comment_id}/replies` returns replies for one parent comment from local DB with pagination/sorting (`limit`, `offset`, `sort_by`, `direction`) and `{ items, total }`.
- `GET /comments/{comment_id}` returns one comment row by ID (with `video_title` and `video_thumbnail_url` join fields), or `404` when missing.
- `GET /comments` returns paginated comment rows (parents + replies) with optional `video_id` filter, sorting, `parents` hydration for missing parent rows, and persisted `reply_count` from the comments table (no per-request reply-count subquery).
- `backend/src/youtube/comments.py` sync stores flattened comments from `commentThreads.list` + paginated `comments.list(parentId=...)` so top-level comments and all replies are persisted; top-level rows persist `reply_count` from `snippet.totalReplyCount`, and reply rows store `reply_count=0`.
- `GET /comments` also returns `parents` for missing in-page parent comments so frontend can reconstruct reply threads across paginated pages.
- Video detail `Comments` tab loads comments from `GET /comments?video_id=...`, renders paginated threaded comments (parent + replies), and if a reply's parent is off-page it shows the parent from `parents` as a synthetic thread root.
- Video detail `Comments` tab backfills missing parents by calling `GET /comments/{comment_id}` when a reply parent is absent from both the current page `items` and hydrated `parents`.
- Video detail comments UI uses a non-interactive, YouTube Studio-like list style (avatar + handle/date + text + reply count only), without action controls (reply/like/dislike/love).
- Comments data now stores and returns `author_profile_image_url` from YouTube; `frontend/src/pages/VideoDetail.tsx` uses it for real avatar images with initials fallback.
- Comments schema now includes `reply_count` on each row; sync writes top-level rows with `totalReplyCount`.
- `frontend/src/components/comments/CommentThreadItem.tsx` is the reusable threaded comment item UI (parent + replies) used by video detail and reusable across pages.
- `frontend/src/components/comments/CommentThreadItem.tsx` upscales YouTube avatar URLs (e.g., `s28` -> `s88`) before rendering profile images.
- `frontend/src/components/comments/CommentThreadItem.tsx` shows likes beneath each comment text and always shows parent-child count as `Replies: N`.
- Comment thread actions (`Show more`, `Hide replies`) use the shared `ActionButton` component (styled compactly for thread rows).
- `frontend/src/pages/VideoDetail.tsx` comments tab includes a sort dropdown with `Date posted`, `Likes`, and `Reply count`, and persists selection via `videoDetailCommentsSort`.
- `frontend/src/pages/VideoDetail.tsx` comments tab uses `reply_count` from `/comments` for thread counts; replies stay collapsed by default and `Show more` loads 5 additional replies from `GET /comments/{comment_id}/replies`.
- Reply totals are authoritative from stored parent `reply_count` (not derived from currently loaded reply items).
- Video detail comment threads include both `Show more` (load next 5 replies) and `Hide replies` (collapse loaded replies) controls per parent thread.
- Video detail comments pagination uses `frontend/src/components/ui/PageSwitcher.tsx`.
- Videos and Sync Runs pagination also use `frontend/src/components/ui/PageSwitcher.tsx` instead of page-specific inline button groups.
- Videos, Sync Runs, Video Detail comments, and Comments page include a per-page dropdown in the pagination footer (bottom-right) with options `10`, `25`, `50`, `100`, defaulting to `10`.
- `frontend/src/pages/Comments.tsx` is a dedicated comments page that loads paginated comments via `GET /comments`, groups the current page by `video_id`, and renders each group with `CommentThreadItem` entries.
- `GET /comments` includes `video_title` and `video_thumbnail_url` (joined from `videos`) so grouped comments can show a readable video header with thumbnail without extra requests.
- `frontend/src/pages/Comments.tsx` includes a top `Published range` filter using `DateRangePicker`, wired to `GET /comments` query params `published_after` and `published_before`.
- `frontend/src/pages/Comments.tsx` also backfills missing reply parents via `GET /comments/{comment_id}` when parent rows are not present in the current paginated dataset.
- `frontend/src/pages/Comments.tsx` persists filter/sort/pagination settings in local storage key `commentsPageSettings`; default sort is `Date posted`.
- `frontend/src/pages/Dashboard.tsx` includes two `VideoDetailListCard` instances (`Latest longform content`, `Latest shortform content`) that load the most recent 10 public videos per type via `GET /analytics/top-content` with `sort_by=published_at&direction=desc`.
- `frontend/src/pages/Dashboard.tsx` includes a `Channel analytics` card showing current subscribers as lifetime net subscribers (`SUM(subscribers_gained - subscribers_lost)`) from `GET /analytics/channel-daily`, plus last-28-day summary metrics (views, watch time hours, estimated revenue) with simple up/down trend indicators vs the previous 28-day window.
- Dashboard cards are componentized under `frontend/src/components/dashboard/`:
  - `ChannelAnalyticsCard.tsx`: DB-backed channel summary card (lifetime net subscribers + last-28-day metrics/trends).
  - `CommentsPreviewCard.tsx`: Recent comments preview card (latest comments list + `View more` to `/comments`).
- Dashboard rows share a common sizing class (`dashboard-row` in `frontend/src/pages/Page.css`) so channel and latest-content sections follow the same width format instead of per-row width overrides.
- Dashboard cards use a shared fixed card width pattern via `.dashboard-row > .page-card` (non-stretch, wrapping layout) so sections do not auto-fill row width.

## Frontend Components
- `frontend/src/components/ui/ActionButton.tsx`: Standard button styling. Supports `primary` and `soft` variants.
- `frontend/src/components/ui/DateRangePicker.tsx`: Two-date input with a visual separator for custom ranges.
- `frontend/src/components/ui/Dropdown.tsx`: Custom dropdown used for range selectors.
- `frontend/src/components/ui/MultiSelect.tsx`: Custom multiselect for choosing sync targets.
- `frontend/src/components/ui/PageSwitcher.tsx`: Reusable pagination control with previous/next buttons and `Page X of Y` label, used in Video Detail comments, Videos list, Sync Runs list, and Comments page.
- `frontend/src/components/ui/PageSizePicker.tsx`: Reusable pagination-size dropdown (`10`, `25`, `50`, `100`) used in Videos, Sync Runs, Video Detail comments, and Comments page.
- `frontend/src/components/dashboard/ChannelAnalyticsCard.tsx`: Dashboard card for subscriber/summary analytics.
- `frontend/src/components/dashboard/CommentsPreviewCard.tsx`: Dashboard card for recent comments preview.
- `frontend/src/components/ui/YearInput.tsx`: Numeric year input for year-only syncs.
- `frontend/src/components/ui/ProgressBar.tsx`: Horizontal progress bar with optional step text.
- `frontend/src/components/layout/PageCard.tsx`: Generic card wrapper for consistent layout blocks.
- `frontend/src/components/analytics/MetricChartCard.tsx`: Analytics KPI + chart card for the Analytics page.
- `frontend/src/components/analytics/TopContentTable.tsx`: Top content table for analytics summaries.
- Component barrels live in:
  - `frontend/src/components/ui/index.ts`
  - `frontend/src/components/analytics/index.ts`
  - `frontend/src/components/layout/index.ts`
  - `frontend/src/components/comments/index.ts`
