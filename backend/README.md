# YouTube Analytics Backend

FastAPI-based backend for YouTube Analytics application.

## Setup

### Prerequisites

Install [uv](https://docs.astral.sh/uv/) - a fast Python package installer.

### Installation

1. **Create virtual environment with Python 3.12**:
   ```bash
   uv venv --python 3.12
   ```

2. **Install dependencies**:
   ```bash
   uv pip install -r requirements.txt
   ```

3. **Activate virtual environment**:

   **Windows:**
   ```bash
   .venv\Scripts\activate
   ```

   **Linux/macOS:**
   ```bash
   source .venv/bin/activate
   ```

4. **Set up environment variables**:
   ```bash
   cp .env.example .env
   ```

### Client Secrets

Add your Google API client secrets to the `backend/secrets/` folder:

1. Download your OAuth 2.0 credentials from [Google Cloud Console](https://console.cloud.google.com/)
2. Place the credential files in the `backend/secrets/` folder:
   - `client_secret.json` - OAuth 2.0 client credentials
   - Any other required credential files for YouTube API access

## Running the Server

Start the development server:
```bash
python server.py
```

The server will run on `http://127.0.0.1:8000`

### API Documentation

Once the server is running, visit:
- **Swagger UI**: http://127.0.0.1:8000/docs
- **ReDoc**: http://127.0.0.1:8000/redoc

## Dependencies

- `fastapi` - Web framework
- `uvicorn` - ASGI server
- `google-api-python-client` - YouTube API client
- `google-auth-oauthlib` - Google OAuth authentication
- `pandas` - Data manipulation
- `pydantic-settings` - Configuration management
- `langchain-openai` & `langchain-core` - LLM integrations
- `plotly` - Data visualization
- Plus additional utilities for processing and analysis

See `requirements.txt` for the complete list.
