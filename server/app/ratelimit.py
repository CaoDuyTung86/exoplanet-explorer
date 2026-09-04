"""A fixed-window counter, used to slow down password guessing.

Redis-backed when Redis is up, per-process otherwise. The degraded mode is weaker — N
API processes means N times the budget — but it is strictly better than no limit, and it
keeps the login endpoint working when the cache is down instead of failing closed on
something that is not a security boundary by itself.

Fixed windows let a burst straddle a boundary and get 2x the budget. That is acceptable
here: the limit exists to make online guessing slow, and Argon2 already makes each
attempt expensive.
"""

from __future__ import annotations

import logging
import time

from . import redis_client

log = logging.getLogger(__name__)

# key -> (count, window_started_at). Only used when Redis is unavailable.
_local: dict[str, tuple[int, float]] = {}


async def hit(key: str, *, limit: int, window_seconds: int) -> bool:
    """Count one attempt. Returns True while the caller is still under the limit."""
    client = await redis_client.get()
    if client is not None:
        try:
            full_key = f"exo:rl:{key}"
            count = await client.incr(full_key)
            if count == 1:
                # Only the first hit in a window sets the expiry, so the window is fixed
                # from the first attempt rather than sliding forward on every retry.
                await client.expire(full_key, window_seconds)
            return count <= limit
        except Exception:  # noqa: BLE001
            log.warning("rate limit: redis failed, falling back to in-process counter",
                        exc_info=True)

    now = time.time()
    count, started = _local.get(key, (0, now))
    if now - started >= window_seconds:
        count, started = 0, now
    count += 1
    _local[key] = (count, started)
    return count <= limit


async def reset(key: str) -> None:
    """Clear a counter — called after a successful login so a user who fumbled their
    password a few times is not still throttled afterwards."""
    client = await redis_client.get()
    if client is not None:
        try:
            await client.delete(f"exo:rl:{key}")
        except Exception:  # noqa: BLE001
            log.debug("rate limit: redis delete failed", exc_info=True)
    _local.pop(key, None)
