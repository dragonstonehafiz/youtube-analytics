from __future__ import annotations

from contextlib import asynccontextmanager

import uvicorn
from fastapi import FastAPI

from config import settings
from routes import router
from src.database.db import init_db


@asynccontextmanager
async def lifespan(_: FastAPI):
    init_db()
    if settings.auto_sync_on_startup:
        # TODO: wire sync job once the DB + YouTube API client exist.
        pass
    yield


app = FastAPI(title="YouTube Analytics Backend", lifespan=lifespan)
app.include_router(router)


if __name__ == "__main__":
    uvicorn.run("server:app", host="127.0.0.1", port=8000, reload=True)
