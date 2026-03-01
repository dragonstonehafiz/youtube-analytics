"""Minimal abstract interface for API-based LLM backends."""

from __future__ import annotations

from abc import ABC, abstractmethod
import json
from pathlib import Path
from typing import Literal


class LLMInterface(ABC):
    """Base contract for API-backed LLM providers."""

    CONFIG_FILENAME: str = ""
    DEFAULT_MODEL: str = ""

    def config_path(self) -> Path:
        """Return per-provider JSON config path under backend/data."""
        if not self.CONFIG_FILENAME:
            raise ValueError("CONFIG_FILENAME must be defined by provider implementation.")
        return Path(__file__).resolve().parents[1] / "data" / self.CONFIG_FILENAME

    def save_config(self) -> None:
        """Persist current provider settings to backend/data JSON."""
        config_path = self.config_path()
        config_path.parent.mkdir(parents=True, exist_ok=True)
        config_path.write_text(json.dumps(self.to_config(), indent=2), encoding="utf-8")

    @abstractmethod
    def set_defaults(self) -> None:
        """Initialize provider default fields."""
        raise NotImplementedError

    @abstractmethod
    def to_config(self) -> dict[str, object]:
        """Serialize provider settings for JSON storage."""
        raise NotImplementedError

    @abstractmethod
    def initialize(self) -> None:
        """Initialize the LLM backend."""
        raise NotImplementedError

    @abstractmethod
    def change_model(self, model_name: str) -> None:
        """Swap or update the underlying model configuration."""
        raise NotImplementedError

    @abstractmethod
    def get_model(self) -> str:
        """Return the current model identifier."""
        raise NotImplementedError

    @abstractmethod
    def configure(self, settings: dict[str, object]) -> None:
        """Set provider-specific configuration values."""
        raise NotImplementedError

    @abstractmethod
    def get_settings_schema(self) -> dict[str, object]:
        """Return a schema describing configurable settings."""
        raise NotImplementedError

    @abstractmethod
    def infer(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """Run inference with the current model."""
        raise NotImplementedError

    @abstractmethod
    def get_status(self) -> Literal["loaded", "not_loaded", "error"]:
        """Return current model status."""
        raise NotImplementedError
