from pathlib import Path
from typing import Sequence

SCOPES: Sequence[str] = (
    "https://www.googleapis.com/auth/yt-analytics.readonly",
    "https://www.googleapis.com/auth/yt-analytics-monetary.readonly",
    "https://www.googleapis.com/auth/youtube.readonly",
)

CLIENT_SECRETS_FILE = Path("secrets/client_secret.json")
TOKEN_FILE = Path("secrets/youtube-token.json")
DATA_DIR = Path("data")
