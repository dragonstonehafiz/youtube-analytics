from __future__ import annotations

from fastapi import APIRouter

from config import settings

router = APIRouter()


@router.get("/health")
def health() -> dict:
    return {"ok": True, "auto_sync": settings.auto_sync_on_startup}
