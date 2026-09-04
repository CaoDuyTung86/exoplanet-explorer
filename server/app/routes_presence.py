"""The WebSocket visitors connect to, plus a plain snapshot endpoint for debugging.

Protocol, deliberately tiny:

    client -> {"type": "ping"}                     keeps the peer's TTL alive
    client -> {"type": "focus", "planetId": "..."} says what it is looking at

    server -> {"type": "welcome", "you": {...}, "peers": [...], "backend": "redis"}
    server -> {"type": "join" | "update", "peer": {...}}
    server -> {"type": "leave", "peerId": "..."}
    server -> {"type": "pong"}

The client never gets to choose its own display name or colour — see `presence.py`.
"""

from __future__ import annotations

import asyncio
import contextlib
import json
import logging
import time
import uuid
from typing import Any

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from . import auth, presence, security
from .config import get_settings

log = logging.getLogger(__name__)

router = APIRouter(tags=["presence"])

# A focus message is a planet id and nothing else; anything larger is not our protocol.
MAX_FRAME_BYTES = 2048
# Ignore focus updates that arrive faster than this. A visitor dragging through the map
# can fire selections continuously, and every one of them would otherwise be a publish.
MIN_UPDATE_INTERVAL = 0.25


@router.get("/v1/presence")
async def presence_snapshot() -> dict[str, Any]:
    """Who is online right now, without opening a socket. Also reports which backend is
    live, which is the quickest way to see whether Redis is actually wired up."""
    try:
        peers = await presence.hub.peers()
        degraded = False
    except Exception:  # noqa: BLE001
        # Redis went away after startup. Presence is a nicety, so this reports itself as
        # empty and degraded rather than turning a header widget into a 500.
        log.warning("presence: snapshot failed, reporting degraded", exc_info=True)
        peers = []
        degraded = True

    return {
        "backend": presence.hub.backend_name,
        "degraded": degraded,
        "localConnections": presence.hub.local_connections,
        "count": len(peers),
        "peers": peers,
    }


@router.websocket("/v1/ws/presence")
async def presence_socket(websocket: WebSocket) -> None:
    settings = get_settings()
    await websocket.accept()

    # The session cookie rides along with the handshake, so a signed-in visitor appears
    # under their own name without the client asserting anything.
    user = await auth.resolve_session(websocket.cookies.get(security.SESSION_COOKIE))

    peer_id = uuid.uuid4().hex
    peer = presence.Peer(
        id=peer_id,
        name=user.display_name if user else presence.make_callsign(peer_id),
        color=presence.pick_color(peer_id),
        authenticated=user is not None,
        user_id=user.id if user else None,
    )

    # Order matters here, and getting it wrong is subtle. The queue is attached *first*
    # so that no event occurring during the handshake is missed. The welcome frame is
    # then written directly, before the writer task exists, so it is guaranteed to be
    # the first thing the client reads — otherwise the visitor's own join event, coming
    # back around through Redis, can overtake it.
    queue = presence.hub.attach()
    writer: asyncio.Task | None = None

    # Everything past attach() runs under one finally, so no failure — including Redis
    # dying between the join and the welcome — can leave a queue attached to the hub
    # receiving events nobody will ever read.
    try:
        if not await presence.hub.join(peer):
            await websocket.send_text(json.dumps({"type": "error", "reason": "presence_full"}))
            await websocket.close(code=1013)  # "try again later"
            return

        # The joiner needs the room as it already is; everyone else is kept current by
        # the event stream alone. Buffered events may repeat what the snapshot already
        # contains, which is harmless because the client applies them by peer id.
        await websocket.send_text(
            json.dumps(
                {
                    "type": "welcome",
                    "you": peer.to_json(),
                    "peers": await presence.hub.peers(),
                    "backend": presence.hub.backend_name,
                    "heartbeatSeconds": max(5, settings.presence_ttl_seconds // 3),
                }
            )
        )

        writer = asyncio.create_task(
            _writer(websocket, queue), name=f"presence-writer-{peer_id[:8]}"
        )
        await _read_loop(websocket, peer, settings.presence_ttl_seconds)

    except WebSocketDisconnect:
        pass
    except Exception:  # noqa: BLE001
        log.exception("presence: socket failed for peer %s", peer_id[:8])
        with contextlib.suppress(Exception):
            await websocket.close(code=1011)  # internal error; the client will retry
    finally:
        if writer is not None:
            writer.cancel()
            with contextlib.suppress(asyncio.CancelledError):
                await writer
        presence.hub.detach(queue)
        # Announce the departure rather than waiting for the TTL, so a deliberate close
        # updates everyone else immediately.
        with contextlib.suppress(Exception):
            await presence.hub.leave(peer_id)


async def _read_loop(websocket: WebSocket, peer: presence.Peer, ttl: int) -> None:
    last_update = 0.0

    while True:
        # A socket whose client has stopped talking is closed rather than left dangling.
        # The peer's record would expire anyway, but the connection would not.
        try:
            raw = await asyncio.wait_for(websocket.receive_text(), timeout=ttl * 2)
        except (asyncio.TimeoutError, TimeoutError):
            log.info("presence: closing socket for %s — no heartbeat", peer.id[:8])
            with contextlib.suppress(Exception):
                await websocket.close(code=1001)  # "going away"
            return

        if len(raw) > MAX_FRAME_BYTES:
            continue
        try:
            message = json.loads(raw)
        except json.JSONDecodeError:
            continue
        if not isinstance(message, dict):
            continue

        kind = message.get("type")

        if kind == "ping":
            await presence.hub.heartbeat(peer)
            await websocket.send_text(json.dumps({"type": "pong"}))

        elif kind == "focus":
            planet_id = message.get("planetId")
            if planet_id is not None and (
                not isinstance(planet_id, str) or len(planet_id) > 120
            ):
                continue
            if planet_id == peer.planet_id:
                continue

            now = time.monotonic()
            if now - last_update < MIN_UPDATE_INTERVAL:
                continue
            last_update = now

            peer.planet_id = planet_id
            await presence.hub.update(peer)


async def _writer(websocket: WebSocket, queue: asyncio.Queue[dict[str, Any]]) -> None:
    """Drains this connection's queue. Runs separately from the read loop so a socket
    that is slow to flush blocks only itself."""
    try:
        while True:
            event = await queue.get()
            await websocket.send_text(json.dumps(event))
    except asyncio.CancelledError:
        raise
    except Exception:  # noqa: BLE001
        log.debug("presence: writer stopped", exc_info=True)
