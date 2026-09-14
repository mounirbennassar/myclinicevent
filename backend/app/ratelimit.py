"""Small in-process sliding-window limiter. Good for a single API instance; use Redis if you scale out."""

import threading
import time
from collections import defaultdict, deque

from fastapi import Request

from .config import settings
from .errors import ApiError

_hits: dict[str, deque[float]] = defaultdict(deque)
_lock = threading.Lock()


def client_ip(request: Request | None) -> str | None:
    """The caller's IP. Behind exactly one trusted proxy the LAST X-Forwarded-For entry is the one that
    proxy appended, so a client can't spoof its address by sending its own header."""
    if request is None:
        return None
    forwarded = request.headers.get("x-forwarded-for")
    if settings.trust_proxy and forwarded:
        return forwarded.rsplit(",", 1)[-1].strip()
    return request.client.host if request.client else None


def check_rate(request: Request, bucket: str, limit: int, window_seconds: int, key: str = "") -> None:
    if not settings.rate_limit_enabled:
        return
    k = f"{bucket}:{client_ip(request)}:{key}"
    now = time.monotonic()
    with _lock:
        hits = _hits[k]
        while hits and hits[0] <= now - window_seconds:
            hits.popleft()
        if len(hits) >= limit:
            raise ApiError(429, "rate_limited", "Too many attempts. Please wait a few minutes and try again.")
        hits.append(now)
