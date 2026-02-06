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
    client_secret_path: Path = Field(default=BASE_DIR / "secrets" / "client_secret.json")
    scopes: str = Field(
        default=(
            "https://www.googleapis.com/auth/youtube.readonly,"
            "https://www.googleapis.com/auth/yt-analytics.readonly,"
            "https://www.googleapis.com/auth/yt-analytics-monetary.readonly"
        )
    )

    @field_validator("data_dir", "secrets_dir", "db_path", "client_secret_path", mode="before")
    @classmethod
    def resolve_paths(cls, value: object) -> Path:
        if isinstance(value, Path):
            path = value
        else:
            path = Path(str(value))
        if path.is_absolute():
            return path
        return BASE_DIR / path

    @property
    def scopes_list(self) -> List[str]:
        return [s.strip() for s in self.scopes.split(",") if s.strip()]


settings = Settings()
