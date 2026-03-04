from __future__ import annotations

from contextlib import asynccontextmanager
import logging

import uvicorn
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from config import settings
from src.routes import router
from src.database.db import init_db
from src.sync import sync_all


@asynccontextmanager
async def lifespan(_: FastAPI):
    """Initialize database and run startup sync if enabled."""
    init_db()
    yield


app = FastAPI(title="YouTube Analytics Backend", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
app.include_router(router)


class _SkipProgressAccessLog(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        message = record.getMessage()
        return "/sync/progress" not in message


logging.getLogger("uvicorn.access").addFilter(_SkipProgressAccessLog())


if __name__ == "__main__":
    uvicorn.run("server:app", host="0.0.0.0", port=8000, reload=True)
