"""Realtime presence — who else is exploring the map right now.

Two problems have to be solved separately, and conflating them is the usual way this
feature ends up broken:

  * **Fan-out.** A WebSocket lives inside one process. With two API processes behind a
    load balancer, a visitor connected to process A must still see one connected to
    process B. Redis pub/sub is the wire between them: every process publishes its
    events to one channel and subscribes to that same channel, so each process receives
    *all* events — including its own — and forwards them to its local sockets.

  * **Liveness.** A browser tab that is force-quit, or a laptop lid that closes, never
    sends a close frame. The peer's record therefore carries a TTL and the browser
    refreshes it with a heartbeat; a record nobody is refreshing expires on its own. A
    sweeper turns those expiries into "leave" events so the other visitors' lists update.

Redis is optional. With none reachable the hub runs a single-process in-memory backend
and logs which mode it is in, so "docker compose up -d db" on its own still works.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import random
import time
from dataclasses import dataclass, field
from typing import Any, Awaitable, Callable

from . import redis_client
from .config import Settings, get_settings

log = logging.getLogger(__name__)

CHANNEL = "exo:presence:events"
PEER_KEY = "exo:presence:peer:{}"
INDEX_KEY = "exo:presence:index"

# Anonymous visitors get a callsign instead of a name they typed, so nobody can sign the
# presence list as somebody else. Authenticated users show their account's display name.
CALLSIGN_WORDS = (
    "Voyager", "Pioneer", "Cassini", "Kepler", "Hubble", "Juno", "Galileo",
    "Rosetta", "Magellan", "Ulysses", "Spitzer", "Chandra", "Webb", "Gaia",
    "Herschel", "Dawn", "Curiosity", "Perseverance", "Parker", "Lucy",
)
PEER_COLORS = (
    "#22d3ee", "#a78bfa", "#f472b6", "#facc15", "#4ade80",
    "#fb923c", "#60a5fa", "#f87171", "#2dd4bf", "#c084fc",
)


@dataclass
class Peer:
    """One connected visitor, as everyone else sees them."""

    id: str
    name: str
    color: str
    authenticated: bool
    user_id: int | None = None
    planet_id: str | None = None
    since: float = field(default_factory=time.time)

    def to_json(self) -> dict[str, Any]:
        return {
            "id": self.id,
            "name": self.name,
            "color": self.color,
            "authenticated": self.authenticated,
            "planetId": self.planet_id,
            "since": self.since,
        }


def make_callsign(peer_id: str) -> str:
    """Deterministic from the id, so the same tab keeps the same name across a reconnect
    without the client being trusted to tell us what it is called.

    Six hex characters of suffix, not four: at the 200-peer ceiling, 16 bits collide
    about a quarter of the time, which would put two identical names in the same room.
    """
    seed = int(peer_id[:8], 16) if len(peer_id) >= 8 else abs(hash(peer_id))
    word = CALLSIGN_WORDS[seed % len(CALLSIGN_WORDS)]
    return f"{word}-{peer_id[:6].upper()}"


def pick_color(peer_id: str) -> str:
    seed = int(peer_id[8:12], 16) if len(peer_id) >= 12 else abs(hash(peer_id))
    return PEER_COLORS[seed % len(PEER_COLORS)]


# --- backends ---------------------------------------------------------------------


class _MemoryBackend:
    """Single-process fallback. Correct, just not shared between processes."""

    name = "memory"

    def __init__(self) -> None:
        self._peers: dict[str, dict[str, Any]] = {}
        self._seen: dict[str, float] = {}
        self._on_event: Callable[[dict], Awaitable[None]] | None = None

    async def start(self, on_event: Callable[[dict], Awaitable[None]]) -> None:
        self._on_event = on_event

    async def stop(self) -> None:
        self._peers.clear()
        self._seen.clear()

    async def put(self, peer: dict[str, Any], ttl: int) -> None:
        self._peers[peer["id"]] = peer
        self._seen[peer["id"]] = time.time()

    async def touch(self, peer_id: str, ttl: int) -> bool:
        if peer_id not in self._peers:
            return False
        self._seen[peer_id] = time.time()
        return True

    async def drop(self, peer_id: str) -> None:
        self._peers.pop(peer_id, None)
        self._seen.pop(peer_id, None)

    async def all(self) -> list[dict[str, Any]]:
        return list(self._peers.values())

    async def expired(self, ttl: int) -> list[str]:
        cutoff = time.time() - ttl
        return [pid for pid, seen in self._seen.items() if seen < cutoff]

    async def publish(self, event: dict[str, Any]) -> None:
        # No broker to round-trip through, so deliver straight to the local sockets.
        if self._on_event is not None:
            await self._on_event(event)


class _RedisBackend:
    """Shared state plus pub/sub, so presence survives more than one API process."""

    name = "redis"

    def __init__(self, client: Any) -> None:
        self._redis = client
        self._task: asyncio.Task | None = None
        self._pubsub: Any = None

    async def start(self, on_event: Callable[[dict], Awaitable[None]]) -> None:
        # Subscribing happens inside the task, not here, so a Redis that is briefly
        # unavailable at startup delays presence instead of failing the whole app.
        self._task = asyncio.create_task(self._listen(on_event), name="presence-subscriber")

    async def _listen(self, on_event: Callable[[dict], Awaitable[None]]) -> None:
        """Subscribe, and keep subscribing.

        This loop is the reason presence survives a Redis restart. `pubsub.listen()`
        raises when the connection drops, and if that simply ended the task the process
        would go on serving WebSockets while quietly forwarding nothing — the worst kind
        of failure, because everything still looks up.
        """
        backoff = 1.0

        while True:
            try:
                pubsub = self._redis.pubsub(ignore_subscribe_messages=True)
                await pubsub.subscribe(CHANNEL)
                self._pubsub = pubsub
                backoff = 1.0
                log.info("presence: subscribed to %s", CHANNEL)

                async for message in pubsub.listen():
                    if message.get("type") != "message":
                        continue
                    try:
                        await on_event(json.loads(message["data"]))
                    except Exception:  # noqa: BLE001 - one bad frame must not kill the loop
                        log.exception("presence: dropping malformed event")

            except asyncio.CancelledError:
                raise
            except Exception as exc:  # noqa: BLE001
                log.warning(
                    "presence: subscriber lost Redis (%s), reconnecting in %.0fs",
                    exc, backoff,
                )
                await asyncio.sleep(backoff)
                backoff = min(30.0, backoff * 2)

    async def stop(self) -> None:
        if self._task is not None:
            self._task.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._task
        if self._pubsub is not None:
            with contextlib.suppress(Exception):
                await self._pubsub.unsubscribe(CHANNEL)
                await self._pubsub.aclose()
        # The client itself is shared (see redis_client) and closed once at shutdown.

    async def put(self, peer: dict[str, Any], ttl: int) -> None:
        pipe = self._redis.pipeline()
        pipe.set(PEER_KEY.format(peer["id"]), json.dumps(peer), ex=ttl)
        pipe.zadd(INDEX_KEY, {peer["id"]: time.time()})
        await pipe.execute()

    async def touch(self, peer_id: str, ttl: int) -> bool:
        # EXPIRE returns 0 when the key is already gone, which is exactly the signal
        # that this peer was swept and needs to re-announce itself.
        refreshed = await self._redis.expire(PEER_KEY.format(peer_id), ttl)
        if not refreshed:
            return False
        await self._redis.zadd(INDEX_KEY, {peer_id: time.time()})
        return True

    async def drop(self, peer_id: str) -> None:
        pipe = self._redis.pipeline()
        pipe.delete(PEER_KEY.format(peer_id))
        pipe.zrem(INDEX_KEY, peer_id)
        await pipe.execute()

    async def all(self) -> list[dict[str, Any]]:
        ids = await self._redis.zrange(INDEX_KEY, 0, -1)
        if not ids:
            return []
        raw = await self._redis.mget([PEER_KEY.format(pid) for pid in ids])
        return [json.loads(blob) for blob in raw if blob]

    async def expired(self, ttl: int) -> list[str]:
        """Index entries whose peer key has already expired.

        The sorted set is not covered by the key TTL, so it is the thing that would leak
        if nothing pruned it. Scoring by last-seen makes finding the candidates a range
        query rather than a scan of every member.
        """
        stale = await self._redis.zrangebyscore(INDEX_KEY, "-inf", time.time() - ttl)
        if not stale:
            return []
        alive = await self._redis.mget([PEER_KEY.format(pid) for pid in stale])
        return [pid for pid, blob in zip(stale, alive) if not blob]

    async def publish(self, event: dict[str, Any]) -> None:
        await self._redis.publish(CHANNEL, json.dumps(event))


# --- hub --------------------------------------------------------------------------


class PresenceHub:
    """Owns the backend, the local socket queues and the sweeper."""

    def __init__(self, settings: Settings | None = None) -> None:
        self._settings = settings or get_settings()
        self._backend: _MemoryBackend | _RedisBackend = _MemoryBackend()
        self._queues: set[asyncio.Queue[dict[str, Any]]] = set()
        self._sweeper: asyncio.Task | None = None

    @property
    def backend_name(self) -> str:
        return self._backend.name

    @property
    def local_connections(self) -> int:
        return len(self._queues)

    async def start(self) -> None:
        self._backend = await self._make_backend()
        await self._backend.start(self._deliver)
        self._sweeper = asyncio.create_task(self._sweep_loop(), name="presence-sweeper")
        log.info("presence hub started (%s backend)", self._backend.name)

    async def _make_backend(self) -> _MemoryBackend | _RedisBackend:
        client = await redis_client.get()
        if client is None:
            log.warning(
                "presence: no Redis, using the in-memory backend. Presence will not be "
                "shared between API processes."
            )
            return _MemoryBackend()
        return _RedisBackend(client)

    async def stop(self) -> None:
        if self._sweeper is not None:
            self._sweeper.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await self._sweeper
        await self._backend.stop()
        self._queues.clear()

    # -- local sockets --

    def attach(self) -> asyncio.Queue[dict[str, Any]]:
        """A queue per connection, so one stalled client cannot block the broadcast."""
        queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue(maxsize=64)
        self._queues.add(queue)
        return queue

    def detach(self, queue: asyncio.Queue[dict[str, Any]]) -> None:
        self._queues.discard(queue)

    async def _deliver(self, event: dict[str, Any]) -> None:
        for queue in list(self._queues):
            try:
                queue.put_nowait(event)
            except asyncio.QueueFull:
                # The reader is not keeping up. Dropping an update is the right failure:
                # the next snapshot will make that client whole again.
                log.debug("presence: dropped an event for a slow client")

    # -- peer lifecycle --

    async def join(self, peer: Peer) -> bool:
        """Announce a peer. False when the room is full."""
        current = await self._backend.all()
        if len(current) >= self._settings.presence_max_peers:
            return False
        await self._backend.put(peer.to_json(), self._settings.presence_ttl_seconds)
        await self._backend.publish({"type": "join", "peer": peer.to_json()})
        return True

    async def update(self, peer: Peer) -> None:
        await self._backend.put(peer.to_json(), self._settings.presence_ttl_seconds)
        await self._backend.publish({"type": "update", "peer": peer.to_json()})

    async def heartbeat(self, peer: Peer) -> None:
        """Refresh the TTL; re-announce if this peer had already been swept."""
        if not await self._backend.touch(peer.id, self._settings.presence_ttl_seconds):
            await self.join(peer)

    async def leave(self, peer_id: str) -> None:
        await self._backend.drop(peer_id)
        await self._backend.publish({"type": "leave", "peerId": peer_id})

    async def peers(self) -> list[dict[str, Any]]:
        return await self._backend.all()

    # -- sweeper --

    async def sweep_once(self) -> list[str]:
        """Turn expired records into leave events. Returns the ids that were removed."""
        gone = await self._backend.expired(self._settings.presence_ttl_seconds)
        for peer_id in gone:
            await self._backend.drop(peer_id)
            await self._backend.publish({"type": "leave", "peerId": peer_id})
        return gone

    async def _sweep_loop(self) -> None:
        # A third of the TTL, jittered so several API processes do not sweep in lockstep.
        interval = max(5, self._settings.presence_ttl_seconds // 3)
        try:
            while True:
                await asyncio.sleep(interval + random.uniform(0, 2))
                try:
                    swept = await self.sweep_once()
                    if swept:
                        log.info("presence: swept %d stale peer(s)", len(swept))
                except Exception:  # noqa: BLE001 - the loop must outlive one bad sweep
                    log.exception("presence: sweep failed")
        except asyncio.CancelledError:
            raise


hub = PresenceHub()
