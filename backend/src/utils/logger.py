from __future__ import annotations

import logging
from pathlib import Path
from typing import Optional


def get_logger(
    name: str,
    level: Optional[int] = None,
    filename: Optional[str] = None,
    console: bool = True,
) -> logging.Logger:
    """Return a logger that writes to console and an optional file."""
    logger = logging.getLogger(name)
    if logger.handlers:
        return logger

    log_level = level if level is not None else logging.INFO
    logger.setLevel(log_level)

    formatter = logging.Formatter(
        fmt="%(asctime)s | %(levelname)s | %(name)s | %(message)s",
        datefmt="%Y-%m-%d %H:%M:%S",
    )

    if console:
        stream_handler = logging.StreamHandler()
        stream_handler.setFormatter(formatter)
        logger.addHandler(stream_handler)

    if filename:
        outputs_dir = Path(__file__).resolve().parents[2] / "outputs"
        outputs_dir.mkdir(parents=True, exist_ok=True)
        file_path = outputs_dir / filename
        file_handler = logging.FileHandler(file_path, encoding="utf-8")
        file_handler.setFormatter(formatter)
        logger.addHandler(file_handler)

    logger.propagate = False
    return logger
