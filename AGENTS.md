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
