from __future__ import annotations

from pathlib import Path

from google.auth.transport.requests import Request
from google.oauth2.credentials import Credentials
from google_auth_oauthlib.flow import InstalledAppFlow

from config import settings


def get_credentials(token_path: Path | None = None) -> Credentials:
    """Return OAuth credentials, refreshing or creating tokens as needed."""
    if token_path is None:
        token_path = settings.secrets_dir / "token.json"

    creds: Credentials | None = None
    if token_path.exists():
        creds = Credentials.from_authorized_user_file(str(token_path), settings.scopes_list)

    if not creds or not creds.valid or not creds.has_scopes(settings.scopes_list):
        if creds and creds.expired and creds.refresh_token:
            creds.refresh(Request())
        else:
            flow = InstalledAppFlow.from_client_secrets_file(str(settings.client_secret_path), settings.scopes_list)
            creds = flow.run_local_server(port=0, access_type="offline", include_granted_scopes="true", prompt="consent")

        token_path.parent.mkdir(parents=True, exist_ok=True)
        token_path.write_text(creds.to_json(), encoding="utf-8")

    return creds
