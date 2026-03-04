# YouTube Analytics

A web application for analyzing YouTube channel data with metrics on video performance, audience analytics, and content insights.

## What You Need

To use this application:

1. **Google Cloud Project** with these APIs enabled:
   - YouTube Data API v3
   - YouTube Analytics API

2. **OAuth 2.0 Client Credentials** (client_secret.json file)

3. **Python 3.12** (backend)

4. **Node.js & npm** (frontend)

## Pages

- **Dashboard** - Channel overview, latest videos, traffic sources
- **Videos** - Browse all videos with filters (search, privacy status, date range, format)
- **Playlists** - View playlists and their contents
- **Comments** - View and filter channel comments
- **Audience** - Audience demographics and location data
- **Analytics** - Detailed performance charts and metrics
- **Sync Settings** - Sync data from YouTube APIs
- **LLM Settings** - Configure AI analysis features

## Data Sources

Data comes from:
- **YouTube Data API** - Channel info, videos, playlists, comments
- **YouTube Analytics API** - Views, watch time, audience demographics, traffic sources

## Setup

### Backend
```bash
cd backend
uv venv --python 3.12
source .venv/bin/activate  # or .venv\Scripts\activate on Windows
uv pip install -r requirements.txt
python server.py
```

Backend runs on `http://127.0.0.1:8000`

### Frontend
```bash
cd frontend
npm install
npm run start
```

Frontend runs on `http://localhost:5173`

For detailed setup, see [backend/README.md](backend/README.md) and [frontend/README.md](frontend/README.md).

## Docker Setup

To run the application with Docker Compose:

```bash
docker-compose -p youtube-analytics up --build
```

This will:
- Build and start both backend and frontend containers
- Mount `backend/data`, `backend/secrets`, and `backend/outputs` folders for persistence
- Backend runs on `http://127.0.0.1:8000`
- Frontend runs on `http://localhost:5173`

To build from scratch without cache:
```bash
docker-compose -p youtube-analytics build --no-cache
docker-compose -p youtube-analytics up
```

Stop containers with:
```bash
docker-compose -p youtube-analytics down
```
