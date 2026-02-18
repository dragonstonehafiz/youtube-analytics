"""LLM abstractions for API-backed model providers."""

from .interface import LLMInterface
from .openai_model import LLMOpenAI

__all__ = ["LLMInterface", "LLMOpenAI"]
