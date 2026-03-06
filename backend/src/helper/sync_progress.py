from __future__ import annotations

from datetime import datetime
from threading import Lock


class SyncStopRequested(Exception):
    """Raised when user requested stopping an in-progress sync."""


class SyncProgress:
    """Thread-safe in-memory sync progress and API-call tracker."""

    def __init__(self) -> None:
        """Initialize with idle state."""
        self._lock = Lock()
        self._stop_requested = False
        self.started_at = ""
        self.status = "idle"
        self.is_syncing = False
        self.current_step = 0
        self.max_steps = 1
        self.message = ""
        self.stop_requested = False
        self.total_api_calls = 0

    def try_start(self) -> bool:
        """Atomically start a sync if none is running. Returns False if already running."""
        with self._lock:
            if self.is_syncing:
                return False
            self._stop_requested = False
            self.started_at = datetime.utcnow().isoformat() + "Z"
            self.status = "running"
            self.is_syncing = True
            self.current_step = 0
            self.max_steps = 1
            self.message = ""
            self.stop_requested = False
            self.total_api_calls = 0
            return True

    def set_total(self, total: int) -> None:
        """Set max sync steps and clamp current step into bounds."""
        with self._lock:
            safe_total = max(int(total), 1)
            self.max_steps = safe_total
            self.current_step = max(0, min(int(self.current_step), safe_total))

    def set_current(self, current: int) -> None:
        """Set current step, clamped to [0, max_steps]."""
        with self._lock:
            max_steps = max(int(self.max_steps), 1)
            self.current_step = max(0, min(int(current), max_steps))

    def increment(self, step: int = 1) -> None:
        """Increment current step by a positive amount."""
        with self._lock:
            current = int(self.current_step)
            max_steps = max(int(self.max_steps), 1)
            next_value = max(0, min(current + int(step), max_steps))
            self.current_step = next_value

    def increment_api_calls(self, n: int = 1) -> None:
        """Increment the running API call counter."""
        with self._lock:
            self.total_api_calls += max(int(n), 0)

    def get_api_calls(self) -> int:
        """Return the current total API call count."""
        with self._lock:
            return self.total_api_calls

    def format_message(self, template: str, **values: object) -> str:
        """Format and store a progress message using current and total placeholders."""
        with self._lock:
            current = int(self.current_step)
            total = max(int(self.max_steps), 1)
            context = {"current": current, "total": total}
            context.update(values)
            message = template.format(**context)
            self.message = message
            return message

    def to_dict(self) -> dict[str, object]:
        """Return a dictionary snapshot of the current progress state."""
        with self._lock:
            return {
                "started_at": self.started_at,
                "status": self.status,
                "is_syncing": self.is_syncing,
                "current_step": self.current_step,
                "max_steps": self.max_steps,
                "message": self.message,
                "stop_requested": self.stop_requested,
                "total_api_calls": self.total_api_calls,
            }

    def mark_done(self, message: str | None = None) -> None:
        """Mark sync as completed."""
        with self._lock:
            self.status = "done"
            self.is_syncing = False
            self.stop_requested = False
            self._stop_requested = False
            if message is not None:
                self.message = message

    def mark_stopped(self, message: str) -> None:
        """Mark sync as manually stopped."""
        with self._lock:
            self.status = "stopped"
            self.is_syncing = False
            self.message = message
            self.stop_requested = False
            self._stop_requested = False

    def mark_failed(self, message: str) -> None:
        """Mark sync as failed."""
        with self._lock:
            self.status = "failed"
            self.is_syncing = False
            self.message = message
            self.stop_requested = False
            self._stop_requested = False

    def request_stop(self) -> bool:
        """Request graceful stop for a running sync."""
        with self._lock:
            if not self.is_syncing:
                return False
            self._stop_requested = True
            self.stop_requested = True
            return True

    def raise_if_stop_requested(self, message: str) -> None:
        """Raise when a stop has been requested."""
        with self._lock:
            should_stop = self._stop_requested
        if should_stop:
            raise SyncStopRequested(message)
