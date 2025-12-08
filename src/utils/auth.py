from __future__ import annotations

from pathlib import Path
from typing import Sequence

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow


def get_credentials(client_secret_file: Path, token_file: Path, scopes: Sequence[str]) -> Credentials:
    if not client_secret_file.exists():
        raise FileNotFoundError(
            f"Client secret file not found at {client_secret_file}. Download it from the Google Cloud console."
        )

    creds: Credentials | None = None
    if token_file.exists():
        creds = Credentials.from_authorized_user_file(token_file, scopes)

    if creds and creds.expired and creds.refresh_token:
        creds.refresh(Request())
    if not creds or not creds.valid:
        flow = InstalledAppFlow.from_client_secrets_file(client_secret_file, scopes)
        creds = flow.run_local_server(port=0, prompt="consent")
        token_file.parent.mkdir(parents=True, exist_ok=True)
        token_file.write_text(creds.to_json())
        print(f"Saved refresh token to {token_file}")
    return creds
