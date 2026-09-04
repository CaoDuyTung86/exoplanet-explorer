"""One shared Redis connection, created lazily and allowed to be absent.

Redis is a hard dependency for nothing in this app: presence degrades to a single-process
registry without it and the login throttle degrades to a per-process counter. So the
connection is attempted once, the outcome is cached, and every caller gets either a
client or None — no retry storm on a hot path when Redis is down.
"""

from __future__ import annotations

import logging
from typing import Any

from .config import get_settings

log = logging.getLogger(__name__)

_client: Any | None = None
_attempted = False


async def get() -> Any | None:
    """The shared client, or None when Redis is unreachable or not installed."""
    global _client, _attempted

    if _attempted:
        return _client
    _attempted = True

    try:
        from redis.asyncio import Redis
    except ImportError:
        log.warning("redis package is not installed — running without Redis")
        return None

    settings = get_settings()
    try:
        client = Redis.from_url(
            settings.redis_url, decode_responses=True, socket_connect_timeout=3
        )
        await client.ping()
    except Exception as exc:  # noqa: BLE001
        log.warning("redis at %s is unreachable (%s) — running without Redis",
                    settings.redis_url, exc)
        return None

    log.info("connected to redis at %s", settings.redis_url)
    _client = client
    return _client


async def close() -> None:
    global _client, _attempted
    if _client is not None:
        try:
            await _client.aclose()
        except Exception:  # noqa: BLE001
            log.debug("redis close failed", exc_info=True)
    _client = None
    _attempted = False
