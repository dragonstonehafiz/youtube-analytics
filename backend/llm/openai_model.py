"""OpenAI-backed LLM implementation using LangChain."""

from __future__ import annotations

import json
from langchain_core.messages import HumanMessage, SystemMessage
from langchain_openai import ChatOpenAI
from typing import Literal

from .interface import LLMInterface


class LLMOpenAI(LLMInterface):
    """Minimal OpenAI LLM backend implementation."""

    CONFIG_FILENAME = "llm_openai.json"
    DEFAULT_MODEL = "gpt-4o-mini"

    def _verify_llm(self, llm: ChatOpenAI) -> None:
        """Validate API key/model by making a minimal inference call."""
        probe = llm.bind(temperature=0, max_tokens=1)
        probe.invoke([HumanMessage(content="ping")])

    def _build_llm(
        self,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> ChatOpenAI:
        """Build a ChatOpenAI client from the current settings."""
        if not self.api_key:
            raise ValueError("Missing OpenAI API key.")
        return ChatOpenAI(
            model=self.current_model,
            api_key=self.api_key,
            base_url=self.base_url,
            temperature=self._temperature if temperature is None else temperature,
            max_tokens=self._max_tokens if max_tokens is None else max_tokens,
        )

    def initialize(self) -> None:
        """Load config from JSON and initialize the OpenAI backend client."""
        self.set_defaults()
        config_path = self.config_path()
        try:
            if config_path.exists():
                config_data = json.loads(config_path.read_text(encoding="utf-8"))
                if isinstance(config_data, dict):
                    self.configure(config_data)
                    return
            else:
                self.save_config()
            llm = self._build_llm()
            self._verify_llm(llm)
            self._llm = llm
            self.status = "loaded"
        except Exception:
            self._llm = None
            self.status = "error"
            raise

    def change_model(self, model_name: str) -> None:
        """Update active model and refresh the backend client."""
        self.current_model = model_name
        if model_name not in self.model_list:
            self.model_list.append(model_name)
        self.save_config()
        llm = self._build_llm()
        self._verify_llm(llm)
        self._llm = llm
        self.status = "loaded"

    def get_model(self) -> str:
        """Return the active OpenAI model name."""
        return self.current_model

    def configure(self, settings: dict[str, object]) -> None:
        """Update backend settings, persist config, and rebuild client immediately."""
        if "provider_name" in settings and settings["provider_name"] is not None:
            self.provider_name = str(settings["provider_name"])
        if "api_key" in settings:
            self.api_key = str(settings["api_key"]) if settings["api_key"] is not None else None
        if "base_url" in settings:
            self.base_url = str(settings["base_url"]) if settings["base_url"] is not None else None
        if "current_model" in settings and settings["current_model"] is not None:
            self.current_model = str(settings["current_model"])
        if "model_list" in settings and isinstance(settings["model_list"], list):
            self.model_list = [str(item) for item in settings["model_list"]]
        if not self.model_list:
            self.model_list = [self.current_model]
        if self.current_model not in self.model_list:
            self.model_list.append(self.current_model)
        if "temperature" in settings and settings["temperature"] is not None:
            self._temperature = float(settings["temperature"])
        if "max_tokens" in settings:
            self._max_tokens = int(settings["max_tokens"]) if settings["max_tokens"] is not None else None
        self.save_config()
        llm = self._build_llm()
        self._verify_llm(llm)
        self._llm = llm
        self.status = "loaded"
    
    def set_defaults(self) -> None:
        """Initialize OpenAI provider default fields."""
        if hasattr(self, "provider_name"):
            return
        self.provider_name: str = "openai"
        self.current_model: str = self.DEFAULT_MODEL
        self.model_list: list[str] = [self.current_model]
        self.api_key: str | None = None
        self.base_url: str | None = None
        self.status: Literal["loaded", "not_loaded", "error"] = "not_loaded"
        self._temperature: float = 0.2
        self._max_tokens: int | None = None
        self._llm: ChatOpenAI | None = None

    def to_config(self) -> dict[str, object]:
        """Serialize OpenAI backend settings for JSON storage."""
        return {
            "provider_name": self.provider_name,
            "current_model": self.current_model,
            "model_list": self.model_list,
            "api_key": self.api_key,
            "base_url": self.base_url,
            "temperature": self._temperature,
            "max_tokens": self._max_tokens,
        }

    def get_settings_schema(self) -> dict[str, object]:
        """Return supported configuration fields."""
        return {
            "provider": "llm_chatgpt",
            "title": "OpenAI ChatGPT",
            "fields": [
                {
                    "key": "model_name",
                    "label": "Model",
                    "type": "select",
                    "options": [
                        {"label": "gpt-4.1-mini", "value": "gpt-4.1-mini"},
                        {"label": "gpt-4.1", "value": "gpt-4.1"},
                        {"label": "gpt-5.1", "value": "gpt-5.1"},
                        {"label": "gpt-4o", "value": "gpt-4o"},
                        {"label": "o4-mini", "value": "o4-mini"},
                    ],
                    "default": self.current_model,
                    "required": True,
                },
                {
                    "key": "api_key",
                    "label": "API Key",
                    "type": "password",
                    "placeholder": "Leave blank to keep current key",
                    "required": False,
                },
                {
                    "key": "temperature",
                    "label": "Temperature",
                    "type": "number",
                    "min": 0,
                    "max": 2,
                    "step": 0.1,
                    "default": self._temperature,
                },
            ],
        }

    def infer(
        self,
        prompt: str,
        system_prompt: str | None = None,
        temperature: float | None = None,
        max_tokens: int | None = None,
    ) -> str:
        """Run prompt inference with optional system prompt and per-call overrides."""
        llm = self._llm
        if llm is None:
            llm = self._build_llm()

        if temperature is not None or max_tokens is not None:
            llm = self._build_llm(temperature=temperature, max_tokens=max_tokens)

        messages = [HumanMessage(content=prompt)]
        if system_prompt:
            messages = [SystemMessage(content=system_prompt), HumanMessage(content=prompt)]

        response = llm.invoke(messages)
        self._llm = llm
        self.status = "loaded"
        return str(response.content)

    def get_status(self) -> Literal["loaded", "not_loaded", "error"]:
        """Return current backend status."""
        return self.status
