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
GET  /videos                          paginated list (q, privacy_status, content_type, published range)
GET  /videos/{id}                     single video
GET  /videos/published                upload markers (content_type filter)

GET  /analytics/channel-daily         channel-level daily series
GET  /analytics/daily/summary         aggregated daily (content_type filter)
GET  /analytics/video-daily           per-video daily series
GET  /analytics/top-content           ranked videos (views/revenue/published_at)
GET  /analytics/traffic-sources       channel traffic source breakdown
GET  /analytics/video-traffic-sources video-level traffic sources
GET  /analytics/video-traffic-source-top-videos  top videos for a source
GET  /analytics/video-search-insights top search terms by views (date range, video_ids CSV, content_type)
GET  /analytics/video-search-insights/videos  videos for a search term

GET  /playlists                       paginated list
GET  /playlists/{id}                  single playlist
GET  /playlists/{id}/items            paginated items with analytics
GET  /analytics/playlist-daily        playlist-level daily series
GET  /analytics/playlist-video-daily  video-level series for playlist content

GET  /audience                        paginated with comment stats
GET  /audience/active                 top active members (rolling window)
GET  /audience/{channel_id}           single member detail

GET  /comments                        paginated (q, video_id, playlist_id, author_channel_id, dates)
GET  /comments/word-cloud/image       PNG word cloud (q, word_types CSV)

POST /sync/data                       trigger data sync (videos, playlists, comments, audience)
POST /sync/analytics                  trigger analytics sync (analytics pulls, date range, deep_sync)
GET  /sync/data/estimate              estimate data API calls
GET  /sync/analytics/estimate         estimate analytics API calls
POST /sync/stop                       graceful stop
GET  /sync/progress                   current sync status
GET  /sync/runs                       per-stage execution history

GET  /stats/overview                  row counts + storage breakdown
GET  /stats/table-details             schema + date bounds
GET  /stats/table-api-calls           estimated API usage for sync config

GET  /llm/schema                      provider settings schema for UI
GET  /llm/settings                    current provider values
GET  /llm/status                      active LLM status + model
POST /llm/configure                   apply + persist settings, rebuild model
POST /llm/summarize-comments          LLM summary (q, dates, video_id, playlist_id, limit_count, sort_by)
```

---

### Key invariants

- **Sync stage order** (never reorder):
  - **Data stages:** `videos` → `playlists` → `comments` → `audience`
  - **Analytics stages:** `playlist_analytics` → `traffic` → `channel_analytics` → `video_analytics` → `video_traffic_source` → `video_search_insights`
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

### Adding a new reusable component
1. Pick category: `ui/` primitives · `charts/` · `cards/primitives/` · `cards/site/` · `tables/` · `features/`
2. Create `<ComponentName>.tsx` + colocated `<ComponentName>.css` if needed
3. Export from the directory's `index.ts`

---

### PR checklist
- lint and type check: green on changed files
- no hardcoded colors or magic numbers
- no `console.log` left in frontend code
- diff is small and focused; include a brief summary of what changed and why
- update `AGENTS.md` if behavior rules change

### When stuck
- ask a clarifying question or propose a short plan before making large speculative changes
- do not push wide refactors without confirmation



