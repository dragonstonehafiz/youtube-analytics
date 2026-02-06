# Repo Note

Keep this file updated as the project evolves.

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
