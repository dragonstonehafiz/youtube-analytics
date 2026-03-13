# AGENTS.md

YouTube analytics dashboard — FastAPI + React/TypeScript + SQLite.

```
YouTube API → Backend Sync → SQLite → Backend API → Frontend UI
```

---

### Do
- use parameterized queries in all DB helpers — never string concatenation
- use `backend/src/utils/logger.py` for errors only; no progress logs
- use type hints and docstrings on all backend functions
- use explicit TypeScript types; avoid `any`
- use existing UI components before writing custom controls
- use `MetricChartCard` for all time-series charts; pass raw daily series (it handles aggregation)
- use `Dropdown` (not native `<select>`) for all dropdowns
- use `usePagination.ts` hook for shared page-size state
- use local storage keys namespaced by page (e.g. `videoDetailGranularity`)
- keep `.method()` on same line as object in Python — no chained calls starting on new lines
- keep CSS in colocated `.css` files; no inline styles
- import `../shared.css` in every page component before the page-specific CSS
- use `'../../components/...'` import paths from inside page subdirectories

### Don't
- don't add `updated_at` tracking to `videos`, `playlists`, `playlist_items`, or `comments`
- don't use FK constraints — `playlist_items.video_id` is a raw YouTube ID
- don't aggregate CPM by sum — use ad-impression-weighted average
- don't auto-trigger word cloud or LLM summary on filter change — both are manual
- don't store tab state in URL params — local state only
- don't create a new component if an existing one covers the use case
- don't add new heavy dependencies without approval
- don't run project-wide builds when a file-scoped check will do

---

### Commands

```bash
# Backend — type check a single file
cd backend && python -m mypy src/routes/videos.py

# Backend — run server
cd backend && uvicorn server:app --reload

# Frontend — type check a single file
cd frontend && npx tsc --noEmit

# Frontend — lint a single file
cd frontend && npx eslint src/pages/Videos/Videos.tsx --fix

# Frontend — full build (only when explicitly requested)
cd frontend && npm run build
```

---

### Safety and permissions

Allowed without asking:
- read files, list files, search
- type check, lint single files
- run backend server locally

Ask first:
- `pip install` / `npm install` new packages
- `git push` or force-push
- deleting files or DB records
- full project builds or end-to-end test suites

---

### Project structure

```
backend/
  server.py                      # FastAPI entry point
  src/routes/                    # API route handlers by domain
    videos.py, playlists.py, audience.py, comments.py
    analytics.py, sync.py, stats.py, llm.py
    helpers.py                   # shared route helpers
  src/sync.py                    # sync orchestration + stage order
  src/database/                  # DB helpers per table
    schema.sql, db.py
    videos.py, playlists.py, comments.py, audience.py
    analytics.py, channel_daily.py, playlist_daily.py
    traffic_sources.py, video_traffic_source.py, video_search_insights.py
  src/youtube/                   # YouTube API clients
    auth.py, client.py, videos.py, playlists.py
    comments.py, analytics.py, subscribers.py
  src/helper/
    estimates.py                 # API call estimation logic
    sync_dates.py, sync_progress.py
  src/llm/
    interface.py                 # LLM provider base + lifecycle
    openai_model.py
  src/utils/logger.py            # error logger → backend/outputs/

frontend/
  src/App.tsx                    # routes
  src/pages/shared.css           # common layout/filter/pagination styles
  src/pages/
    Analytics/, Audience/, AudienceDetail/, Comments/
    Competitors/                 # thumbnail testing tabs
    Dashboard/, LLMSettings/, PlaylistDetail/, Playlists/
    Settings/, SyncSettings/, VideoDetail/, Videos/
  src/components/
    ui/                          # primitives
    charts/                      # visualizations
    cards/primitives/            # generic card wrappers
    cards/site/                  # domain-specific cards
    tables/                      # table + list components
    features/                    # complex composite components
  src/hooks/                     # shared React hooks
  src/utils/                     # formatting helpers
```

---

### Component reference

**UI primitives** (`components/ui/`):
- `ActionButton` — primary/soft button variants
- `Dropdown` — custom select (never native `<select>`)
- `MultiSelect` — filter chips; closes on outside click
- `DateRangePicker` — date range inputs
- `YearInput` — single year picker
- `MarkdownTextbox` — read-only rendered markdown with copy-to-clipboard
- `PageSwitcher`, `PageSizePicker` — pagination controls
- `ProfileImage` — avatar with fallback
- `Sidebar` — app navigation sidebar
- `StatCard` — single-metric stat display
- `Tooltip`, `TooltipIcon` — viewport-clamped tooltip and help indicator

**Charts** (`components/charts/`):
- `MetricChartCard` — primary time-series chart: KPI chips, trend indicators, granularity bucketing (Daily/7-days/28-days/90-days/Monthly/Yearly), zero-fill, upload markers
- `DonutChart` — interactive pie/donut
- `HistogramChart` — histogram/bar chart
- `RatioBar` — single or segmented horizontal ratio bar
- `ProgressBar` — progress indicator
- `UploadPublishMarkers` — video upload markers overlaid on charts
- `UploadPublishTooltip` — tooltip showing videos for a chart data point

**Card primitives** (`components/cards/primitives/`):
- `PageCard` — generic card container
- `DonutChartCard` — card wrapping a donut chart
- `HistogramChartCard` — card wrapping a histogram

**Site cards** (`components/cards/site/`):
- `ChannelAnalyticsCard` — dashboard channel metrics summary
- `CommentsPreviewCard` — dashboard recent comments preview
- `CommentsWordCloudCard` — word-cloud PNG display with Word types multiselect and manual generate button
- `ContentInsightsCard` — content performance insights
- `LlmSummaryCard` — manual LLM summary output with controls
- `MonetizationEarningsCard` — revenue/RPM/CPM breakdown card
- `MonetizationContentPerformanceCard` — per-video monetization performance
- `MostActiveAudienceCard` — dashboard top audience members
- `SearchInsightsTopTermsCard` — top YouTube search terms for the active date range
- `TrafficSourceShareCard` — traffic source share breakdown
- `TrafficSourceTopVideosCard` — top videos for a selected traffic source
- `VideoDetailListCard` — top content with typical-range meters

**Competitors page** (`pages/Competitors/`):
- `ThumbnailUploader` — drag-and-drop thumbnail file upload (PNG/JPG, max 5MB) with preview row
- `TestThumbnailHomeTab` — YouTube home feed layout (3-col grid videos, 5-col grid shorts) with category filters
- `TestThumbnailSearchTab` — YouTube search results layout with filter buttons (All, Shorts, Videos, Unwatched, Watched, Recently uploaded, Live)
- `TestThumbnailVideoPlayerTab` — YouTube video player layout with main player, info section, comments, and sidebar recommendations
- `CompetitorVideosTab` — paginated list of competitor videos

**Tables** (`components/tables/`):
- `VideoListTable`, `VideoListRow` — paginated video list
- `PlaylistItemsTable`, `PlaylistItemRow` — playlist items with analytics
- `TopContentTable` — sorted top-content table for Analytics
- `CommentThreadItem` — individual comment row
- `CommentVideoGroup` — comments grouped by video
- `CommentsSection` — full comment list with pagination

**Features** (`components/features/`):
- `DataRangeControl` — analytics-style range row (granularity + presets/year/custom)
- `CommentFilter` — reusable filter row (text search, date range, sort, reset)
- `commentGroups.ts` (`buildCommentGroups()`) — helper to group comments by video

**Hooks** (`hooks/`):
- `useAnalyticsDateRange` — shared date range state for analytics pages
- `useLlmSummary` — LLM summary fetch + state management
- `usePagination` — shared page-size persistence + page reset on size change
- `usePrivacyMode` — toggle to hide sensitive numbers
- `useWordCloud` — word cloud fetch + state management

**Utils** (`utils/`):
- `date.ts` — `formatDisplayDate()` and date helpers (`day month year` format)
- `number.ts` — `X,XXX` whole numbers, `X,XX.000` decimals
- `storage.ts` — local storage helpers
- `trafficSeries.ts` — traffic source data transformation
- `years.ts` — year range helpers

---

### Good examples

- time-series chart → `MetricChartCard` in any Analytics tab
- page structure → `frontend/src/pages/Videos/Videos.tsx`
- reusable filter → `frontend/src/components/features/CommentFilter.tsx`
- shared state with localStorage → `frontend/src/pages/Competitors/Competitors.tsx` (parent component managing thumbnails + tabs, synced to localStorage)
- multi-tab component structure → `frontend/src/pages/Competitors/` (parent manages shared state, tabs receive shared data as props; tabs manage their own isolated data)
- file upload with preview → `frontend/src/pages/Competitors/ThumbnailUploader.tsx` (drag-drop, file validation, preview display)
- DB helper → `backend/src/database/videos.py` (get/upsert pattern)
- sync stage → any stage function in `backend/src/sync.py`
- API route → `backend/src/routes/analytics.py`

### Don't copy
- any inline `style={{}}` usage — use colocated CSS instead
- direct `fetch()` in components — call from the page component and pass data down

---

### API docs

Route files: `backend/src/routes/`

Key patterns:
- most analytics return `{ items: [...], totals: {...} }`
- date params are ISO strings (`YYYY-MM-DD`); backend clamps to available data
- `content_type` param = `video` (longform) or `short` (Shorts)
- `video_search_insights.date` is a month bucket (`YYYY-MM-01`), not per-day

Selected endpoints:
```
GET  /videos
  -> { items: Video[], total: number }

GET  /videos/{id}
  -> { item: Video }

GET  /videos/published
  -> { items: [{ day: string, count: number, items: [{ video_id, title, published_at, thumbnail_url, content_type }] }] }

GET  /analytics/channel-daily
  -> { items: ChannelDailyRow[], totals: { views, watch_time_minutes, subscribers_gained, subscribers_lost, estimated_revenue, ... } }

GET  /analytics/channel-daily/outliers
  -> { items: [{ start_date: string, end_date: string }] }

GET  /analytics/channel-card-summary
  -> { subscribers_net: number, current: { views, watch_time_minutes, estimated_revenue, subscribers_gained, subscribers_lost }, previous: { views, watch_time_minutes, estimated_revenue } }

GET  /analytics/content-insights
  -> { total_videos, in_period_views, in_period_pct, catalog_views, catalog_pct, in_period_videos, shortform_views, shortform_pct, longform_views, longform_pct, shortform_video_count, longform_video_count, median_views, mean_views, p90_threshold, outlier_count, outlier_videos, outlier_share_pct, all_views, all_video_avg_view_durations, all_videos }

GET  /analytics/daily/summary
  -> { items: DailySummaryRow[], totals: { views, watch_time_minutes, estimated_revenue, ... } }

GET  /analytics/video-daily
  -> { items: VideoDailyRow[] }

GET  /analytics/top-content
  -> { items: TopContentRow[] }

GET  /analytics/playlist-traffic-sources
  -> { items: [{ day: string, traffic_source: string, views: number, watch_time_minutes: number }] }

GET  /analytics/playlist-video-traffic-source-top-videos
  -> { items: [{ video_id: string, title: string, thumbnail_url: string, published_at: string, views: number, watch_time_minutes: number }] }

GET  /analytics/traffic-sources
  -> { items: [{ traffic_source: string, views: number, watch_time_minutes: number }] }

GET  /analytics/video-traffic-sources
  -> { items: [{ video_id: string, traffic_source: string, views: number, watch_time_minutes: number }] }

GET  /analytics/video-traffic-source-top-videos
  -> { items: [{ video_id: string, title: string, thumbnail_url: string, views: number, watch_time_minutes: number }] }

GET  /analytics/video-search-insights
  -> { items: [{ search_term: string, views: number, watch_time_minutes: number }] }

GET  /analytics/video-search-insights/videos
  -> { items: [{ video_id: string, title: string, thumbnail_url: string, views: number, watch_time_minutes: number }] }

GET  /analytics/video-daily/top-contributors
  -> { items: [{ video_id: string, title: string, thumbnail_url: string, content_type: string, published_at: string, metric_value: number }] }

GET  /analytics/years
  -> { years: string[] }

GET  /playlists
  -> { items: Playlist[], total: number }

GET  /playlists/{id}
  -> { item: Playlist }

GET  /playlists/{id}/video-ids
  -> { items: string[] }

GET  /playlists/{id}/items
  -> { items: [{ ...playlist_item_fields, video_views, video_comment_count, video_like_count, video_recent_views, video_watch_time_minutes, video_average_view_duration_seconds }], total: number }

GET  /analytics/playlist-daily
  -> { items: PlaylistDailyRow[], totals: { views, watch_time_minutes, estimated_revenue, ... } }

GET  /analytics/playlist-video-daily
  -> { items: PlaylistVideoDailyRow[], totals: { views, watch_time_minutes, estimated_revenue, ... } }

GET  /audience
  -> { items: AudienceRow[], total: number }

GET  /audience/active
  -> { items: ActiveAudienceRow[], range: { days: number, start_date: string, end_date: string } }

GET  /audience/{channel_id}
  -> { item: AudienceMember, stats: AudienceMemberStats }

GET  /comments
  -> { items: CommentRow[], total: number }

GET  /comments/word-cloud/image
  -> PNG image bytes (Content-Type: image/png)

GET  /competitors
  -> { [key: string]: { label: string, channel_id: string, enabled: boolean, row_count: number } }

GET  /competitors/videos
  -> { items: CompetitorVideo[], total: number }

PUT  /competitors
  -> { success: true } or { error: string }

DELETE /competitors/{channel_id}
  -> { success: true } or { error: string }

GET  /competitors/related-videos
  -> { items: CompetitorVideo[], total: number }

POST /sync/data
  -> { queued: true } or { error: string }

POST /sync/analytics
  -> { queued: true } or { error: string }

POST /sync/competitors
  -> { queued: true } or { error: string }

GET  /health
  -> { ok: true }

GET  /me
  -> { id, title, description, published_at, country, views, subscriber_count, video_count }

GET  /sync/data/estimate
  -> { total: number, by_pull: Record<string, number> } or { error: string }

GET  /sync/analytics/estimate
  -> { total: number, by_pull: Record<string, number> } or { error: string }

POST /sync/stop
  -> { accepted: boolean }

GET  /sync/progress
  -> { is_syncing: boolean, current_step: number, max_steps: number, message: string, stop_requested?: boolean }

GET  /sync/runs
  -> { items: SyncRun[], total: number }

POST /sync/reset-table
  -> { success: true, message: string } or { error: string }

GET  /stats/overview
  -> { table_row_counts: [{ table: string, rows: number }], table_storage: [{ table: string, bytes: number, percent: number }], ... }

GET  /stats/table-details
  -> { table: string, date_column: string | null, oldest_item_date: string | null, newest_item_date: string | null, columns: ColumnInfo[] }

GET  /stats/table-api-calls
  -> { table: string, deep_sync: boolean, minimum_api_calls: number, basis: string }

GET  /llm/schema
  -> LLM provider schema object from `openai_model.get_settings_schema()`

GET  /llm/settings
  -> { provider_name: string, model_name: string, temperature: number, base_url?: string, has_api_key: boolean }

GET  /llm/status
  -> { status: string, model_name: string }

POST /llm/configure
  -> { ok: true, status: string, model_name: string } or HTTP 400 { detail: string }

POST /llm/summarize-comments
  -> { summary: string, total_input_comments: number, used_comments: number, sort_by: string } or HTTP 400 { detail: string }
```

---

### Key invariants

- **Sync pipelines** (three independent syncs):
  - **Data sync:** `videos` → `playlists` → `comments` → `audience`
  - **Analytics sync:** `playlist_analytics` → `traffic` → `channel_analytics` → `video_analytics` → `video_traffic_source` → `video_search_insights`
  - **Competitors sync:** fetch/store competitor channel videos (independent, configured per-competitor)
- **Shorts detection**: UUSH playlist only — fail-fast if unavailable
- **Stage failure isolation**: failed stages are recorded; sync continues with remaining stages
- **LLM config**: stored at `backend/data/<provider>.json`; `set_defaults()` called from `initialize()`; OpenAI probe call required for `loaded` status
- **CPM**: ad-impression-weighted average, never summed
- **Segmented analytics bounds**: `video_analytics`, `video_traffic_source`, `video_search_insights`, `playlist_analytics` all clamp per-request `query_start` to the active segment start

---

### Adding a new sync stage
1. `backend/src/youtube/<resource>.py` — fetch function
2. `backend/src/database/schema.sql` — new table
3. `backend/src/database/<table>.py` — get/upsert helpers
4. `backend/src/sync.py` — `sync_<stage>()` function inserted in correct order
5. `backend/src/helper/estimates.py` — estimation function
6. `backend/src/routes/helpers.py` — update `estimate_min_api_calls_for_table`
7. `frontend/src/pages/SyncSettings/SyncSettings.tsx` — add pull option to multiselect

### Adding a new page
1. `frontend/src/pages/<PageName>/` — create directory
2. `<PageName>.tsx` — import `../shared.css` then `./<PageName>.css`
3. `<PageName>.css` — page-specific styles only
4. `index.ts` — `export { default } from './<PageName>'`
5. `frontend/src/App.tsx` — add import + `<Route>`

### Adding a multi-tab page
Multi-tab pages should centralize shared types, utilities, and components to reduce code repetition:

1. `<PageName>.tsx` — parent component that manages **shared state** (data used by 2+ tabs), handles tab switching, and passes shared data to tabs as props
2. `<TabName>.tsx` — individual tab components that receive shared data as props; if a tab needs data only it uses, it fetches and manages that data itself
3. `types.ts` — shared TypeScript interfaces and models used across multiple tabs
4. `utils.ts` — shared utility functions, constants, and helpers used across tabs
5. `<SharedComponentName>.tsx` — reusable components used by 2+ tabs (avoid tab-specific logic)
6. `<PageName>.css` — page-level styles; colocate tab-specific styles in `<TabName>.css` if isolated to one tab
7. `index.ts` — `export { default } from './<PageName>'`
8. `frontend/src/App.tsx` — add import + `<Route>`

Example: `Competitors/` page uses `types.ts` for image/thumbnail models, `utils.ts` for shared filter/layout logic, and `ThumbnailUploader.tsx` as a reusable component across test tabs.

### Adding a new reusable component
1. Pick category: `ui/` primitives · `charts/` · `cards/primitives/` · `cards/site/` · `tables/` · `features/`
2. Create `<ComponentName>.tsx` + colocated `<ComponentName>.css` if needed
3. Export from the directory's `index.ts`

---

### PR checklist
- **BEFORE finishing: run lint and type check on all changed files — they must be error-free**
  - Backend: `python -m mypy src/routes/<file>.py` for changed route files
  - Frontend: `npx eslint src/pages/<page>/<file>.tsx --fix` for changed component files — do not leave eslint errors
- no hardcoded colors or magic numbers
- no `console.log` left in frontend code
- diff is small and focused; include a brief summary of what changed and why
- update `AGENTS.md` if behavior rules change

### When stuck
- ask a clarifying question or propose a short plan before making large speculative changes
- do not push wide refactors without confirmation



