from __future__ import annotations

from pathlib import Path
from typing import List

from pydantic import Field, field_validator
from pydantic_settings import BaseSettings, SettingsConfigDict

BASE_DIR = Path(__file__).resolve().parent


class Settings(BaseSettings):
    model_config = SettingsConfigDict(
        env_file=BASE_DIR / ".env",
        env_file_encoding="utf-8",
    )

    data_dir: Path = Field(default=BASE_DIR / "data")
    secrets_dir: Path = Field(default=BASE_DIR / "secrets")
    db_path: Path = Field(default=BASE_DIR / "data" / "youtube.db")
    client_secret_path: Path = Field(
        default=BASE_DIR / "secrets" / "client_secret.json"
    )
    auto_sync_on_startup: bool = True
    scopes: List[str] = Field(
        default_factory=lambda: [
            "https://www.googleapis.com/auth/youtube.readonly",
            "https://www.googleapis.com/auth/yt-analytics.readonly",
        ]
    )

    @field_validator("scopes", mode="before")
    @classmethod
    def parse_scopes(cls, value: object) -> List[str]:
        if isinstance(value, str):
            return [s.strip() for s in value.split(",") if s.strip()]
        if isinstance(value, list):
            return value
        return []


settings = Settings()
