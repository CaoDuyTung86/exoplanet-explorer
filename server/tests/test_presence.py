"""Tests for the presence hub.

These run against the in-memory backend, which is the same code path everything else in
the hub uses — `join`, `update`, `leave` and the sweeper do not know which backend they
are talking to. Redis is stubbed out rather than started, so the suite still needs no
services running.
"""

from __future__ import annotations

import asyncio
import hashlib
import uuid

import pytest

from app import presence, redis_client
from app.config import Settings


@pytest.fixture
def hub(monkeypatch) -> presence.PresenceHub:
    """A hub forced onto the in-memory backend, with a short TTL so expiry is testable."""

    async def no_redis():
        return None

    monkeypatch.setattr(redis_client, "get", no_redis)
    settings = Settings(presence_ttl_seconds=1, presence_max_peers=3)
    return presence.PresenceHub(settings)


def make_peer(index: int) -> presence.Peer:
    # Real ids are uuid4 hex, so a test id has to be spread across the whole string
    # rather than zero-padded — the callsign is derived from the leading characters.
    peer_id = hashlib.md5(str(index).encode()).hexdigest()
    return presence.Peer(
        id=peer_id,
        name=presence.make_callsign(peer_id),
        color=presence.pick_color(peer_id),
        authenticated=False,
    )


async def drain(queue: asyncio.Queue) -> list[dict]:
    events = []
    while not queue.empty():
        events.append(queue.get_nowait())
    return events


class TestIdentity:
    def test_callsign_is_stable_for_an_id(self):
        # The client never sends its own name, so the same id must always render the
        # same way — that is what makes a reconnect look like the same visitor.
        assert presence.make_callsign("abcdef0123") == presence.make_callsign("abcdef0123")

    def test_different_ids_get_different_callsigns(self):
        names = {presence.make_callsign(uuid.uuid4().hex) for _ in range(200)}
        # 200 is the room ceiling; two visitors showing the same name would be confusing.
        assert len(names) == 200

    def test_colour_comes_from_the_palette(self):
        assert presence.pick_color("0123456789abcdef") in presence.PEER_COLORS


class TestPeerSerialisation:
    def test_user_id_is_not_exposed(self):
        peer = presence.Peer(id="a" * 32, name="Someone", color="#fff",
                             authenticated=True, user_id=42)
        payload = peer.to_json()
        assert "user_id" not in payload and "userId" not in payload
        assert payload["authenticated"] is True

    def test_carries_what_the_ui_needs(self):
        peer = make_peer(1)
        peer.planet_id = "kepler-442-b"
        payload = peer.to_json()
        assert payload["planetId"] == "kepler-442-b"
        assert set(payload) == {"id", "name", "color", "authenticated", "planetId", "since"}


@pytest.mark.asyncio
class TestHubLifecycle:
    async def test_join_is_broadcast_to_attached_sockets(self, hub):
        await hub.start()
        try:
            queue = hub.attach()
            peer = make_peer(1)
            assert await hub.join(peer)

            events = await drain(queue)
            assert [e["type"] for e in events] == ["join"]
            assert events[0]["peer"]["id"] == peer.id
        finally:
            await hub.stop()

    async def test_a_joiner_appears_in_the_snapshot(self, hub):
        await hub.start()
        try:
            await hub.join(make_peer(1))
            await hub.join(make_peer(2))
            assert len(await hub.peers()) == 2
        finally:
            await hub.stop()

    async def test_focus_change_is_an_update_event(self, hub):
        await hub.start()
        try:
            peer = make_peer(1)
            await hub.join(peer)
            queue = hub.attach()

            peer.planet_id = "trappist-1-e"
            await hub.update(peer)

            events = await drain(queue)
            assert events[-1]["type"] == "update"
            assert events[-1]["peer"]["planetId"] == "trappist-1-e"
        finally:
            await hub.stop()

    async def test_leave_removes_the_peer_and_tells_everyone(self, hub):
        await hub.start()
        try:
            peer = make_peer(1)
            await hub.join(peer)
            queue = hub.attach()

            await hub.leave(peer.id)

            assert await hub.peers() == []
            assert (await drain(queue))[-1] == {"type": "leave", "peerId": peer.id}
        finally:
            await hub.stop()

    async def test_room_has_a_ceiling(self, hub):
        # presence_max_peers is 3 in the fixture.
        await hub.start()
        try:
            for i in range(3):
                assert await hub.join(make_peer(i))
            assert not await hub.join(make_peer(99))
            assert len(await hub.peers()) == 3
        finally:
            await hub.stop()


@pytest.mark.asyncio
class TestLiveness:
    async def test_a_silent_peer_is_swept(self, hub):
        """The case this whole mechanism exists for: a tab that was force-quit never
        sends a close frame, so only the TTL can notice it is gone."""
        await hub.start()
        try:
            peer = make_peer(1)
            await hub.join(peer)
            queue = hub.attach()

            await asyncio.sleep(1.1)  # longer than the fixture's 1s TTL
            swept = await hub.sweep_once()

            assert swept == [peer.id]
            assert await hub.peers() == []
            assert (await drain(queue))[-1] == {"type": "leave", "peerId": peer.id}
        finally:
            await hub.stop()

    async def test_a_heartbeat_keeps_a_peer_alive(self, hub):
        await hub.start()
        try:
            peer = make_peer(1)
            await hub.join(peer)

            await asyncio.sleep(0.6)
            await hub.heartbeat(peer)
            await asyncio.sleep(0.6)

            assert await hub.sweep_once() == []
            assert len(await hub.peers()) == 1
        finally:
            await hub.stop()

    async def test_heartbeat_readmits_a_peer_that_was_already_swept(self, hub):
        """A client whose record expired during a network stall must reappear, not go
        on talking to a room that has forgotten it."""
        await hub.start()
        try:
            peer = make_peer(1)
            await hub.join(peer)
            await asyncio.sleep(1.1)
            await hub.sweep_once()
            assert await hub.peers() == []

            await hub.heartbeat(peer)

            assert [p["id"] for p in await hub.peers()] == [peer.id]
        finally:
            await hub.stop()


@pytest.mark.asyncio
class TestSocketQueues:
    async def test_detach_stops_delivery(self, hub):
        await hub.start()
        try:
            queue = hub.attach()
            hub.detach(queue)
            await hub.join(make_peer(1))
            assert await drain(queue) == []
        finally:
            await hub.stop()

    async def test_a_full_queue_does_not_block_other_clients(self, hub):
        """One client that has stopped reading must not stall the broadcast for the
        rest of the room."""
        await hub.start()
        try:
            stalled = hub.attach()   # never drained
            healthy = hub.attach()   # drained after every event
            overflow = stalled.maxsize + 5
            received = 0

            for _ in range(overflow):
                await hub.join(make_peer(1))  # same id, so the room never fills
                received += len(await drain(healthy))

            # The stalled client's queue caps out and further events are dropped for it,
            # while the client that is keeping up loses nothing.
            assert stalled.full()
            assert stalled.qsize() == stalled.maxsize
            assert received == overflow
        finally:
            await hub.stop()

class _FlakyPubSub:
    """A pubsub that dies once, to prove the subscriber comes back."""

    def __init__(self, failures: list[int]):
        self._failures = failures

    async def subscribe(self, channel):
        return None

    async def unsubscribe(self, channel):
        return None

    async def aclose(self):
        return None

    async def listen(self):
        self._failures.append(1)
        if len(self._failures) == 1:
            raise ConnectionError("redis went away")
        # Second attempt: stay subscribed without producing anything.
        await asyncio.sleep(3600)
        yield {}  # pragma: no cover - unreachable, keeps this an async generator


class _FlakyRedis:
    def __init__(self):
        self.attempts: list[int] = []

    def pubsub(self, **kwargs):
        return _FlakyPubSub(self.attempts)


@pytest.mark.asyncio
class TestRedisResilience:
    async def test_subscriber_resubscribes_after_redis_drops(self):
        """The failure this guards against is silent: if the subscribe loop ends, the
        process keeps serving WebSockets while forwarding nothing at all."""
        client = _FlakyRedis()
        backend = presence._RedisBackend(client)

        async def swallow(event):
            return None

        await backend.start(swallow)
        try:
            # First listen() raises; the loop must sleep and try again.
            await asyncio.sleep(1.4)
            assert len(client.attempts) >= 2, "subscriber gave up after one failure"
            assert not backend._task.done(), "subscriber task exited instead of retrying"
        finally:
            await backend.stop()
