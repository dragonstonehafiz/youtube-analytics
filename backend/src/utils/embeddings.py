"""Singleton embedding model for semantic similarity."""

from __future__ import annotations

from typing import Optional

import numpy as np


class EmbeddingModel:
    """Singleton wrapper for sentence-transformers model."""

    _instance: Optional[EmbeddingModel] = None
    _model = None

    def __new__(cls) -> EmbeddingModel:
        """Ensure only one instance exists."""
        if cls._instance is None:
            cls._instance = super().__new__(cls)
        return cls._instance

    def _load_model(self):
        """Lazy-load the embedding model."""
        if self._model is None:
            from sentence_transformers import SentenceTransformer

            # self._model = SentenceTransformer("multi-qa-MiniLM-L6-cos-v1")

            self._model = SentenceTransformer("data/finetuned_embeddings")

    def embed(self, text: str) -> np.ndarray:
        """Embed a single text string."""
        self._load_model()
        return self._model.encode(text, convert_to_numpy=True)

    def embed_batch(self, texts: list[str]) -> list[np.ndarray]:
        """Embed multiple text strings."""
        self._load_model()
        return self._model.encode(texts, convert_to_numpy=True)

    def similarity(self, text1: str, text2: str) -> float:
        """Compute cosine similarity between two texts."""
        from sklearn.metrics.pairwise import cosine_similarity

        emb1 = self.embed(text1).reshape(1, -1)
        emb2 = self.embed(text2).reshape(1, -1)
        return float(cosine_similarity(emb1, emb2)[0][0])

    def similarity_batch(
        self, query_embedding: np.ndarray, embeddings: list[np.ndarray]
    ) -> list[float]:
        """Compute cosine similarity between one embedding and many."""
        from sklearn.metrics.pairwise import cosine_similarity

        query = query_embedding.reshape(1, -1)
        similarities = cosine_similarity(query, embeddings)[0]
        return [float(s) for s in similarities]


def get_embedding_model() -> EmbeddingModel:
    """Get the singleton embedding model instance."""
    return EmbeddingModel()
