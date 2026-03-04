"""LLM settings and status API endpoints."""

from __future__ import annotations

from typing import Literal

from fastapi import APIRouter, Body, HTTPException

from src.llm import LLMOpenAI
from src.database.db import get_connection

router = APIRouter()
openai_model = LLMOpenAI()
COMMENTS_SUMMARY_SYSTEM_PROMPT = (
    "You are an analyst summarizing YouTube comments for a creator dashboard. "
    "Return markdown using exactly these section headers in this order: "
    "'Overall sentiment:', 'Most common positives:', 'Most common negatives:', "
    "'User requests:'. "
    "Prefix headers with markdown heading syntax (#, ##, ###). "
    "In 'User requests:', provide an exhaustive bullet list of distinct concrete requests users are making. "
    "Include every unique request that appears in the provided comments, even if mentioned only once. "
    "Merge duplicates, but do not omit low-frequency requests. "
    "If there are no requests, write a single bullet: '- None identified.' "
    "Use only evidence from the provided comments, keep it concise, and do not invent facts."
)

try:
    openai_model.initialize()
except Exception:
    # Keep process alive when key/config is missing; status endpoint reports current state.
    pass


def _normalize_settings(settings: dict[str, object]) -> dict[str, object]:
    """Map API payload keys to backend model configuration keys."""
    normalized = dict(settings)
    if "model_name" in normalized and "current_model" not in normalized:
        normalized["current_model"] = normalized.pop("model_name")
    api_key = normalized.get("api_key")
    if isinstance(api_key, str) and not api_key.strip():
        normalized.pop("api_key")
    return normalized


@router.get("/llm/schema")
def get_llm_schema() -> dict:
    """Return active LLM provider settings schema."""
    return openai_model.get_settings_schema()


@router.get("/llm/settings")
def get_llm_settings() -> dict:
    """Return current LLM provider settings for UI hydration."""
    config = openai_model.to_config()
    return {
        "provider_name": config.get("provider_name", "openai"),
        "model_name": config.get("current_model", ""),
        "temperature": config.get("temperature", 0.2),
        "base_url": config.get("base_url"),
        "has_api_key": bool(config.get("api_key")),
    }


@router.get("/llm/status")
def get_llm_status() -> dict:
    """Return current LLM provider status."""
    return {"status": openai_model.get_status(), "model_name": openai_model.get_model()}


@router.post("/llm/configure")
def configure_llm(settings: dict[str, object] = Body(...)) -> dict:
    """Apply LLM settings and initialize the configured model."""
    try:
        openai_model.configure(_normalize_settings(settings))
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    return {"ok": True, "status": openai_model.get_status(), "model_name": openai_model.get_model()}


@router.post("/llm/summarize-comments")
def summarize_comments(
    q: str | None = Body(default=None),
    published_after: str | None = Body(default=None),
    published_before: str | None = Body(default=None),
    video_id: str | None = Body(default=None),
    playlist_id: str | None = Body(default=None),
    author_channel_id: str | None = Body(default=None),
    limit_count: int | None = Body(default=1000, ge=1, le=1000),
    sort_by: Literal["recency", "like_count"] = Body(default="recency"),
) -> dict:
    """Summarize filtered comments from the database with optional limit/ranking."""
    where_clauses: list[str] = []
    params: list[object] = []
    if video_id:
        where_clauses.append("c.video_id = ?")
        params.append(video_id)
    if playlist_id:
        where_clauses.append(
            """
            EXISTS (
                SELECT 1
                FROM playlist_items pi
                WHERE pi.playlist_id = ? AND pi.video_id = c.video_id
            )
            """
        )
        params.append(playlist_id)
    if author_channel_id:
        where_clauses.append("c.author_channel_id = ?")
        params.append(author_channel_id)
    if published_after:
        where_clauses.append("c.published_at >= ?")
        params.append(published_after)
    if published_before:
        where_clauses.append("c.published_at < date(?, '+1 day')")
        params.append(published_before)
    if q:
        where_clauses.append("LOWER(COALESCE(c.text_display, '')) LIKE ?")
        params.append(f"%{q.lower()}%")
    where_sql = f"WHERE {' AND '.join(where_clauses)}" if where_clauses else ""
    order_sql = "COALESCE(c.like_count, 0) DESC, c.published_at DESC" if sort_by == "like_count" else "c.published_at DESC, c.id DESC"
    with get_connection() as conn:
        rows = conn.execute(
            f"""
            SELECT c.text_display, c.published_at, COALESCE(c.like_count, 0) AS like_count
            FROM comments c
            {where_sql}
            ORDER BY {order_sql}
            """,
            tuple(params),
        ).fetchall()
    normalized: list[dict[str, object]] = []
    for row in rows:
        text = str(row["text_display"] or "").strip()
        if not text:
            continue
        normalized.append({"text_display": text, "published_at": str(row["published_at"] or ""), "like_count": int(row["like_count"] or 0)})
    if not normalized:
        raise HTTPException(status_code=400, detail="No comments matched the current filters.")
    if sort_by == "like_count":
        normalized.sort(key=lambda item: int(item.get("like_count") or 0), reverse=True)
    effective_limit = 1000 if limit_count is None else limit_count
    safe_limit = max(1, min(effective_limit, 1000))
    selected = normalized[:safe_limit]
    prompt_lines = [
        f"Summarize the following {len(selected)} YouTube comments.",
        "Each line format: [likes=<number>] [published_at=<iso-date>] <comment>",
        "",
    ]
    prompt_lines.extend(
        [
            f"[likes={int(item['like_count'])}] [published_at={item['published_at']}] {item['text_display']}"
            for item in selected
        ]
    )
    prompt = "\n".join(prompt_lines)

    try:
        summary = openai_model.infer(
            prompt=prompt,
            system_prompt=COMMENTS_SUMMARY_SYSTEM_PROMPT,
            temperature=0.2,
            max_tokens=500,
        )
    except Exception as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return {
        "summary": summary,
        "total_input_comments": len(normalized),
        "used_comments": len(selected),
        "sort_by": sort_by,
    }
