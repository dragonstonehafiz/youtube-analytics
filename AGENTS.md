# Agent Guide

**Purpose**: Help AI agents quickly understand this codebase and make correct changes.  
**Keep updated**: When you modify behavior, update this file in the same commit.

## Architecture Overview

**System**: YouTube analytics dashboard  
**Stack**: FastAPI (backend) + React/TypeScript (frontend) + SQLite (data store)

```
YouTube API → Backend Sync → SQLite → Backend API → Frontend UI
```

### Key Concepts
- **Sync stages**: Independent data pulls from YouTube APIs (videos, comments, analytics, etc.)
- **Daily series**: Most analytics are stored per-day for time-series charts
- **Content types**: Videos are classified as `video` (longform) or `short` (Shorts)
- **Playlist analytics**: Aggregate both playlist-level and video-level metrics

### Directory Structure
```
backend/
  server.py              # FastAPI app entry point
  src/routes/            # API endpoints organized by domain
    __init__.py          # Combines all routers
    helpers.py           # Shared helper functions
    videos.py            # Video endpoints
    playlists.py         # Playlist endpoints
    audience.py          # Audience endpoints
    comments.py          # Comment endpoints
    analytics.py         # Analytics endpoints
    sync.py              # Sync endpoints
    stats.py             # Stats/DB info endpoints
  src/sync.py            # Sync orchestration
  src/database/          # Schema + DB helpers per table
  src/youtube/           # YouTube API client code
  src/helper/            # Shared utilities (estimates, dates, progress)
  src/utils/             # Logger and other utility functions
  
frontend/
  src/pages/             # Page directories (each with index.ts, PageName.tsx, PageName.css)
    shared.css           # Common page layout, filter, and pagination styles
  src/components/        # Reusable UI components (ui/, analytics/, videos/, etc.)
  src/utils/             # Formatting helpers (dates, numbers, storage)
```

## Decision Tree: Where to Make Changes

### Adding/modifying a data sync
1. Schema: `backend/src/database/schema.sql`
2. DB helpers: `backend/src/database/<table>.py`
3. YouTube API fetch: `backend/src/youtube/<resource>.py`
4. Sync stage: `backend/src/sync.py` (add to stage order)
5. API estimation: `backend/src/helper/estimates.py`

### Adding/modifying an API endpoint
1. Route handler: `backend/src/routes/<domain>.py` (videos, playlists, audience, comments, analytics, sync, stats)
2. DB query: `backend/src/database/<table>.py`
3. Frontend API call: `frontend/src/pages/<Page>.tsx` or component
4. Shared helpers: Add to `backend/src/routes/helpers.py` if used across routes

### Adding/modifying a UI page
1. Create page directory: `frontend/src/pages/<PageName>/`
2. Create component: `<PageName>.tsx` (imports `../shared.css` + `./<PageName>.css`)
3. Create styles: `<PageName>.css` (page-specific styles only)
4. Create barrel export: `index.ts` (exports default from `./<PageName>`)
5. Add route: `frontend/src/App.tsx` (imports from `./pages/<PageName>`)
6. Reusable components: Extract to `frontend/src/components/<category>/`

### Adding/modifying a chart or visualization
1. Check if `MetricChartCard` can handle it (single/multi-series support)
2. If new chart type needed: Create in `frontend/src/components/analytics/`
3. Data formatting: In the page component, not the chart component

## Critical Constraints

### Database
- **No `updated_at` tracking** on core tables (`videos`, `playlists`, `playlist_items`, `comments`)
- **Foreign keys**: `playlist_items.video_id` is a raw YouTube ID (no FK to `videos`)
- **Sync history**: One `sync_runs` row per stage execution, not per full sync
- **SQLite location**: `backend/data/youtube.db` (from `backend/.env` `DB_PATH`)

### Sync Behavior
- **Stage order** (immutable): `videos` → `comments` → `audience` → `playlists` → `traffic` → `channel_analytics` → `playlist_analytics` → `video_analytics` → `video_traffic_source` → `video_search_insights`
- **Stop requests**: Cooperative (takes effect before next API call)
- **Shorts detection**: Uses UUSH playlist, not dimensions (fail-fast if unavailable)
- **Progress tracking**: In-memory state in `SyncProgress`, persistence in `sync_runs`

### Date/Time Handling
- **Backend**: ISO date strings (`YYYY-MM-DD`), no timestamps unless required
- **Frontend display**: `day month year` format (e.g., `22 February 2026`) via `formatDisplayDate()`
- **Analytics ranges**: Backend clamps to available data; frontend zero-fills gaps within trimmed range

### Number Formatting (Frontend)
- **Whole numbers**: `X,XXX` (views, subscribers, counts)
- **Decimals**: `X,XX.000` (revenue, CPM, rates)
- **CPM aggregation**: Ad-impression-weighted average, never sum

### UI Patterns
- **Tables**: Fixed row height (truncate/ellipsis, never expand)
- **Column alignment**: Numeric = center, text = left, headers match content
- **Navigation**: Attach to title text when detail page exists
- **Pagination**: Global page size (`10/25/50/100`) shared across all pages
- **Filter persistence**: Use local storage keys per page

## Backend Patterns

### Sync Stages
**Location**: `backend/src/sync.py`

Each stage:
1. Fetches from YouTube API (`backend/src/youtube/<resource>.py`)
2. Transforms/validates data
3. Persists via DB helper (`backend/src/database/<table>.py`)
4. Writes stage completion to `sync_runs`
5. Checks stop flag before each API call

**Progress reporting**: Call `progress.set_stage_progress()` with current item count

### Analytics Endpoints
**Pattern**: Most return `{ items: [...], totals: {...} }` for time-series + aggregates

**Date ranges**: Accept `start_date`/`end_date` as ISO strings, clamp to available data

**Content filtering**: Many support `content_type` param (`video` or `short`)

### Database Helpers
**Location**: `backend/src/database/<table>.py`

**Pattern**: 
- `get_*()` for reads (return dicts or list of dicts)
- `upsert_*()` for writes (handle duplicates gracefully)
- Use parameterized queries (never string concat)

### Estimation Logic
**Location**: `backend/src/helper/estimates.py`

**Pattern**: Return `{ minimum_api_calls, basis }` where basis explains the math

**Period awareness**: Analytics stages use period, metadata stages ignore it

## Frontend Patterns

### Page Directory Structure
**Pattern**: Each page lives in its own directory with three files:

```
pages/
  shared.css                    # Common patterns (page layout, headers, filters, pagination)
  <PageName>/
    index.ts                    # Barrel export: export { default } from './<PageName>'
    <PageName>.tsx              # Page component
    <PageName>.css              # Page-specific styles
```

**CSS imports in page components**:
```typescript
import '../shared.css'        // Common page patterns (REQUIRED)
import './<PageName>.css'     // Page-specific styles
```

**Import paths**: Components in page directories are one level deeper:
- `'../../components/ui'` (not `'../components/ui'`)
- `'../../utils/date'` (not `'../utils/date'`)

**Shared styles** (`shared.css`):
- `.page`, `.page-header`, `.page-content` - page layout
- `.header-row`, `.header-left`, `.header-right` - header sections
- `.filter-section`, `.filter-grid` - filter layouts
- `.pagination-footer` - pagination bar

**Page-specific styles**: Only styles unique to that page, no duplication of shared patterns

### Page Layout
Standard structure:
1. Header with filters/controls (right-aligned if not full-width)
2. Main content (charts, tables, cards)
3. Optional side rail (related content, context cards)

**Tabs**: Local state only (not URL params), default to first tab on navigation

### Component Reuse
**Critical**: Before creating custom UI, check `frontend/src/components/ui/`

**Common components**:
- `ActionButton` - standard buttons (primary/soft variants)
- `Dropdown` - custom select (not native `<select>`)
- `MultiSelect` - for filter chips
- `DateRangePicker` - date range inputs
- `PageSwitcher` + `PageSizePicker` - pagination
- `DonutChart` - interactive pie/donut charts
- `RatioBar` - single or segmented horizontal bars

### Chart Components
**Primary**: `MetricChartCard` - handles most time-series charts

**Modes**:
- Single-series: One metric selector, one line/bar
- Multi-series: One metric selector, multiple comparison lines

**Capabilities**:
- Internal metric selection state
- KPI chips with trend indicators (vs previous period)
- Zero-fill gaps in date range
- Granularity bucketing (`Daily/7-days/28-days/90-days/Monthly/Yearly`)
- Upload markers with rebucketing

**Data requirements**: Pass raw daily series, component handles aggregation

### State Management
**No global state** - use:
- Local component state for UI-only (tabs, modals)
- Local storage for user preferences (filters, pagination, sort)
- URL params only for shareable links (not implemented yet)

**Storage keys**: Namespace by page (e.g., `videoDetailGranularity`, `commentsPageSettings`)

## API Reference (Key Endpoints)

### Videos
- `GET /videos` - paginated list with filters (q, privacy_status, content_type, published range)
- `GET /videos/{video_id}` - single video metadata
- `GET /videos/published` - upload markers for charts (supports content_type filter)

### Analytics
- `GET /analytics/channel-daily` - channel-level daily series (all content)
- `GET /analytics/daily/summary` - aggregated daily series (with content_type filter)
- `GET /analytics/video-daily` - per-video daily series
- `GET /analytics/top-content` - ranked videos by metric (views/revenue/published_at)
- `GET /analytics/traffic-sources` - channel traffic source breakdown
- `GET /analytics/video-traffic-sources` - video-level traffic sources
- `GET /analytics/video-traffic-source-top-videos` - top videos for a traffic source

### Playlists
- `GET /playlists` - paginated list with computed aggregates
- `GET /playlists/{id}` - single playlist
- `GET /playlists/{id}/items` - paginated playlist items with video analytics
- `GET /analytics/playlist-daily` - playlist-level daily series
- `GET /analytics/playlist-video-daily` - video-level daily series for playlist content

### Audience
- `GET /audience` - paginated audience with comment stats
- `GET /audience/active` - top active members in rolling window
- `GET /audience/{channel_id}` - single audience member detail

### Comments
- `GET /comments` - paginated comments with optional `video_id`, `playlist_id`, `author_channel_id`, and date filters

### Sync
- `POST /sync` - trigger sync (accepts pulls array, date range, deep_sync flag)
- `POST /sync/stop` - request graceful stop
- `GET /sync/progress` - current sync status
- `GET /sync/runs` - sync history (per-stage rows)

### Stats
- `GET /stats/overview` - DB metrics (row counts, storage breakdown)
- `GET /stats/table-details` - table schema + date bounds
- `GET /stats/table-api-calls` - estimated API usage for sync config

## Code Style

### Backend (Python)
- Docstrings on all functions
- Type hints on function signatures
- Use `backend/src/utils/logger.py` for error logging only → `backend/outputs/`
- No progress logs - only log errors with context
- Single-line calls when short, multi-line for readability
- Comments for non-obvious API behavior or pagination logic
- Keep `.method()` on same line as object, don't start chained calls on new lines

### Frontend (TypeScript/React)
- Explicit types, avoid `any`
- Extract components when reused 2+ times
- CSS in colocated `.css` files, not inline styles
- Use barrel exports (`index.ts`) for component directories
- Prefer existing UI components over custom controls

## Common Tasks

### Add a new sync stage
1. Add YouTube API fetch function to `backend/src/youtube/<resource>.py`
2. Add DB table to `backend/src/database/schema.sql`
3. Create DB helper in `backend/src/database/<table>.py` (get/upsert functions)
4. Add `sync_<stage>()` function in `backend/src/sync.py`
5. Insert stage in correct position in `sync_all()` stage order
6. Add estimation function to `backend/src/helper/estimates.py`
7. Update estimation logic in `backend/src/routes/helpers.py` (`estimate_min_api_calls_for_table`)
8. Add pull option to `frontend/src/pages/SyncSettings.tsx` multiselect

### Add a new chart to Analytics page
1. Fetch data in `frontend/src/pages/Analytics.tsx` (or relevant page)
2. If on a new tab, add tab option to page header
3. If standard time-series, use `MetricChartCard` with series data
4. If custom visualization, create component in `frontend/src/components/analytics/`
5. Handle granularity bucketing if not using `MetricChartCard`

### Add a new page
1. Create directory: `frontend/src/pages/<PageName>/`
2. Create `<PageName>.tsx` with page component
3. Create `<PageName>.css` with page-specific styles (no shared patterns)
4. Add CSS imports: `import '../shared.css'` and `import './<PageName>.css'`
5. Use `'../../'` prefix for all component/util imports (one level deeper)
6. Create `index.ts`: `export { default } from './<PageName>'`
7. Add route in `frontend/src/App.tsx`: `import PageName from './pages/<PageName>'`
8. Add `<Route path="/page-path" element={<PageName />} />` to routes

### Add a new filter to a list page
1. Add filter UI in page header (use existing `Dropdown`, `DateRangePicker`, etc.)
2. Wire filter value to component state
3. Persist state in local storage on change
4. Pass as query param to API call
5. Add backend support in route handler + DB helper
6. Update `AGENTS.md` if filter has special behavior

## Troubleshooting

### Frontend shows empty charts
- Check API response format matches expected `{ items, totals }` structure
- Verify date range isn't outside available data
- Check browser console for data transformation errors
- Ensure `MetricChartCard` receives daily series, not pre-aggregated data

### Pagination broken on a page
- Verify page size persisted in local storage (`globalPageSize` key)
- Check `PageSwitcher` receives correct `totalPages` calculation
- Ensure backend `total` count matches actual filtered results

### Upload markers not showing
- Check `GET /videos/published` or `/playlists/{id}/published` returns data
- Verify `video_id` present in response (required for clickable markers)
- Check `MetricChartCard` receives `publishedSeries` prop
- Ensure date range in marker query matches chart range

## Page-Specific Behaviors

### SyncSettings (`frontend/src/pages/SyncSettings.tsx`)
- Pull options: `videos`, `comments`, `audience`, `playlists`, `channel_analytics`, `video_analytics`, `playlist_analytics`, `video_traffic_source`, `video_search_insights`
- Period selector includes `From Latest Date` (uses DB latest date as start)
- Database Overview: Donut chart (storage) + table metrics grid (row counts)
- API estimate bars: Normalized to quotas (Data API = 10k, Analytics = 100k)
- Sync Runs table shows per-stage execution history (not per-sync aggregates)

### Analytics (`frontend/src/pages/Analytics.tsx`)
- Three tabs: `Metrics`, `Monetization`, `Discovery`
- Content selector: `All Videos`, `Longform`, `Shortform`
- Granularity: `Daily/7-days/28-days/90-days/Monthly/Yearly`
- Chart range trims to first/last day with data, zero-fills gaps inside
- Upload markers rebucket to match granularity

### VideoDetail (`frontend/src/pages/VideoDetail.tsx`)
- Three tabs: `Analytics`, `Monetization`, `Discovery` (local state, not URL)
- Default tab: `Analytics` on each navigation
- Discovery tab: Multi-series traffic source chart + share card
- Comments tab: Flat list (no inline replies), sorts by date/likes/reply_count

### PlaylistDetail (`frontend/src/pages/PlaylistDetail.tsx`)
- Four tabs: `Metrics`, `Monetization`, `Discovery`, `Comments`
- Content selector: `Playlist Views` vs `Video Views` (different data sources)
- Items table: Sortable Position/Added/Views columns, hover actions
- No search input on items view
- Comments tab: Only comment sorting appears in the tab toolbar row; grouped data + pagination state are page-owned and passed into `CommentsSection`

## Component Reference

**UI primitives** (`frontend/src/components/ui/`):
- `ActionButton`, `Dropdown`, `MultiSelect`, `DateRangePicker`
- `DataRangeControl` - reusable analytics-style range control row (granularity + optional secondary + presets/year/custom)
- `PageSwitcher`, `PageSizePicker` (global page size in local storage)
- `DonutChart`, `RatioBar`, `ProgressBar`

**Chart components** (`frontend/src/components/analytics/`):
- `MetricChartCard` - primary chart (single/multi-series, KPI chips, trends)
- `TrafficSourceShareCard`, `TrafficSourceTopVideosCard`
- `VideoDetailListCard` - top content cards with typical-range meters

**List components**:
- `frontend/src/components/videos/` - `VideoListTable`, `VideoListRow`
- `frontend/src/components/playlists/` - `PlaylistItemsTable`, `PlaylistItemRow`
- `frontend/src/components/comments/` - `CommentThreadItem`, `CommentVideoGroup`, `CommentsSection` (presentational grouped-list renderer)

