"""Permalinks — turning "what I am looking at" into ten characters someone can paste.

A shared view is three separable things: which planets are on screen (the filters), which
one is being looked at (the focus), and where the camera is. This module is the part that
decides what a link is *allowed* to say, and what its name is. It does no I/O, so the
rules below are testable without a database.

Three decisions are worth stating outright, because each of them could reasonably have
gone the other way:

**The slug is the content.** It is a truncated SHA-256 of the canonical state, not a
random string. Sharing the same view twice returns the same link instead of a second row,
and dragging a slider back to where it started gives back the link you already had. The
cost is that a slug is not unguessable the way a random token is — which is fine, because
a shared view is public by construction. It is a bookmark into a public catalog, not a
capability.

**Only what the visitor changed is stored.** A filter left at its default is not an
opinion, so it is dropped from the canonical form. This keeps the payload small, but the
real reason is meaning: if the radius slider's ceiling is raised next year, a link whose
sharer never touched that slider should show the wider range, because they never said
otherwise. A link that pinned every default would silently freeze the whole UI as it
stood the day it was made.

**A link carries a focus or a camera, never both.** With a planet selected the camera is
derived: `CameraController` flies to the planet and then tracks it as it orbits, so any
stored pose would be overwritten within a frame — and the planet is not where it was when
the link was made anyway. Storing both would let a link contradict itself. So the camera
is recorded only for the free-look view, which is the only case where it *is* the state.
"""

from __future__ import annotations

import base64
import hashlib
import json
import math
import re
from typing import Any

from .security import ValidationError

#: Bumped when the meaning of a stored state changes. It is part of the hashed form on
#: purpose: a v2 state is a different thing from a v1 state that happens to look alike,
#: and should not collide with it.
STATE_VERSION = 1

#: Length of the visible slug. 10 characters of base32 is 50 bits; at a million links the
#: chance of any collision is around 4e-4, and a collision between two *different* states
#: is the only kind that matters — identical states are meant to collide.
SLUG_LENGTH = 10

#: Crockford's base32 alphabet: no i, l, o or u, so a slug read aloud or retyped from a
#: screenshot has no character pairs that look alike, and cannot spell anything.
_SLUG_ALPHABET = "0123456789abcdefghjkmnpqrstvwxyz"

#: Planet ids are slugs built from the planet name by ingest (``kepler-452-b``). Matching
#: the shape here means a malformed id is rejected before it reaches a query.
_PLANET_ID_RE = re.compile(r"^[a-z0-9][a-z0-9-]{0,79}$")

#: Bounds for the camera. The scene's far plane is 2000 and ``OrbitControls`` caps the
#: orbit distance at 800; anything outside this is not a view of anything.
CAMERA_LIMIT = 2000.0

#: Mirrors ``DEFAULT_FILTERS`` in ``src/features/explorer/types/index.ts``. The two have
#: to agree: a value equal to the default is dropped here, and the client fills the gap
#: back in from its own copy when the link is opened. They are compared, never merged, so
#: a drift shows up as a filter that stays in the link rather than as a wrong map.
DEFAULT_FILTERS: dict[str, Any] = {
    "searchQuery": "",
    "radiusRange": [0, 30],
    "massRange": [0, 10000],
    "tempRange": [0, 5000],
    "distanceRange": [0, 10000],
    "orbitalPeriodRange": [0, 10000],
    "discoveryMethods": [],
    "spectralTypes": [],
    "yearRange": [1992, 2026],
    "showHabitableOnly": False,
}

#: Outer bounds each range filter is clamped to. A link is data from a browser; a radius
#: range of [-1e9, 1e9] is not a view anyone had, it is someone editing the request.
_RANGE_BOUNDS: dict[str, tuple[float, float]] = {
    "radiusRange": (0.0, 1_000.0),
    "massRange": (0.0, 1_000_000.0),
    "tempRange": (0.0, 100_000.0),
    "distanceRange": (0.0, 1_000_000.0),
    "orbitalPeriodRange": (0.0, 10_000_000.0),
    "yearRange": (1000.0, 3000.0),
}

#: Caps on the two list filters. Both are picked from fixed vocabularies in the UI, so
#: these only bound what an unfriendly client can store.
_MAX_LIST_ITEMS = 32
_MAX_ITEM_LENGTH = 48
_MAX_QUERY_LENGTH = 100

VIEW_MODES = ("3d", "table")

#: The catalog starts in 1992 with the pulsar planets. The upper end is deliberately loose
#: rather than pinned to the current year, so a link made in December still validates in
#: January.
_YEAR_MIN, _YEAR_MAX = 1000, 3000


def _number(value: Any, field: str) -> float:
    """A finite float, or a rejection. ``bool`` is excluded — ``True`` is not a radius."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        raise ValidationError(f"{field} must be a number")
    number = float(value)
    if not math.isfinite(number):
        raise ValidationError(f"{field} must be finite")
    return number


def _clean_range(value: Any, field: str) -> list[float]:
    if not isinstance(value, (list, tuple)) or len(value) != 2:
        raise ValidationError(f"{field} must be a pair of numbers")

    low, high = (_number(v, field) for v in value)
    floor, ceiling = _RANGE_BOUNDS[field]
    low = min(max(low, floor), ceiling)
    high = min(max(high, floor), ceiling)
    # A reversed pair is a slider read backwards, not a filter that matches nothing —
    # swapping is plainly what was meant.
    if low > high:
        low, high = high, low

    if field == "yearRange":
        return [int(round(low)), int(round(high))]

    # Three decimals is finer than any slider step in the UI. Rounding here is what makes
    # the canonical form stable: two views a visitor cannot tell apart must hash alike.
    return [round(low, 3), round(high, 3)]


def _clean_string_list(value: Any, field: str) -> list[str]:
    if not isinstance(value, list):
        raise ValidationError(f"{field} must be a list")
    if len(value) > _MAX_LIST_ITEMS:
        raise ValidationError(f"{field} has too many entries")

    cleaned: set[str] = set()
    for item in value:
        if not isinstance(item, str):
            raise ValidationError(f"{field} must contain only strings")
        trimmed = item.strip()
        if not trimmed:
            continue
        if len(trimmed) > _MAX_ITEM_LENGTH:
            raise ValidationError(f"{field} entry is too long")
        cleaned.add(trimmed)

    # Sorted, so ticking Transit then Microlensing and ticking them the other way round
    # are the same view and get the same link. Click order is not part of what is shared.
    return sorted(cleaned)


def _clean_filters(raw: Any) -> dict[str, Any]:
    if raw is None:
        return {}
    if not isinstance(raw, dict):
        raise ValidationError("filters must be an object")

    cleaned: dict[str, Any] = {}
    for key, default in DEFAULT_FILTERS.items():
        if key not in raw:
            continue
        value = raw[key]

        if key == "searchQuery":
            if not isinstance(value, str):
                raise ValidationError("searchQuery must be a string")
            value = value.strip()[:_MAX_QUERY_LENGTH]
        elif key == "showHabitableOnly":
            if not isinstance(value, bool):
                raise ValidationError("showHabitableOnly must be a boolean")
        elif key in _RANGE_BOUNDS:
            value = _clean_range(value, key)
        else:
            value = _clean_string_list(value, key)

        # The heart of "only what you changed": a value equal to the default is not
        # stored, so it follows the default later rather than freezing it.
        if value != default:
            cleaned[key] = value

    return cleaned


def _clean_camera(raw: Any) -> dict[str, list[float]] | None:
    if raw is None:
        return None
    if not isinstance(raw, dict):
        raise ValidationError("camera must be an object")

    pose: dict[str, list[float]] = {}
    for field in ("position", "target"):
        value = raw.get(field)
        if not isinstance(value, (list, tuple)) or len(value) != 3:
            raise ValidationError(f"camera.{field} must be three numbers")
        axes = [_number(v, f"camera.{field}") for v in value]
        if any(abs(v) > CAMERA_LIMIT for v in axes):
            raise ValidationError(f"camera.{field} is outside the scene")
        # Hundredths of a unit in a scene 2,000 across: below what one frame of damping
        # moves, so two links from the same resting view agree.
        pose[field] = [round(v, 2) for v in axes]

    # A camera sitting exactly on its own target has no direction to look in, and
    # OrbitControls resolves that to an arbitrary one.
    if pose["position"] == pose["target"]:
        raise ValidationError("camera.position and camera.target coincide")

    return pose


def canonical_state(raw: Any) -> dict[str, Any]:
    """Validate a view sent by a browser and reduce it to its canonical form.

    The result is what gets hashed and what gets stored, so two states describing the same
    view must come out byte-identical: the key set is fixed, lists are sorted, numbers are
    rounded, and anything left at its default is absent rather than present-and-equal.
    """
    if not isinstance(raw, dict):
        raise ValidationError("state must be an object")

    state: dict[str, Any] = {"version": STATE_VERSION}

    filters = _clean_filters(raw.get("filters"))
    if filters:
        state["filters"] = filters

    focus = raw.get("focus")
    if focus is not None:
        if not isinstance(focus, str) or not _PLANET_ID_RE.match(focus):
            raise ValidationError("focus must be a planet id")
        state["focus"] = focus

    view = raw.get("view")
    if view is not None:
        if view not in VIEW_MODES:
            raise ValidationError(f"view must be one of {', '.join(VIEW_MODES)}")
        # '3d' is the default view; recording it would make two identical links differ
        # only in whether the client bothered to send the field.
        if view != "3d":
            state["view"] = view

    year = raw.get("timelineYear")
    if year is not None:
        if isinstance(year, bool) or not isinstance(year, int):
            raise ValidationError("timelineYear must be an integer")
        if not _YEAR_MIN <= year <= _YEAR_MAX:
            raise ValidationError("timelineYear is out of range")
        state["timelineYear"] = year

    camera = _clean_camera(raw.get("camera"))
    # Focus wins. The camera is derived from the selected planet frame by frame, so a link
    # holding both would describe two different places — see the module docstring.
    if camera is not None and "focus" not in state:
        state["camera"] = camera

    return state


def canonical_json(state: dict[str, Any]) -> str:
    """The exact bytes the slug is taken over: sorted keys, no incidental whitespace."""
    return json.dumps(state, sort_keys=True, separators=(",", ":"), ensure_ascii=False)


#: Standard base32 output mapped onto the unambiguous alphabet above.
_SLUG_TABLE = str.maketrans("abcdefghijklmnopqrstuvwxyz234567", _SLUG_ALPHABET)


def slug_for(state: dict[str, Any]) -> str:
    """The name of a view: base32 of its digest, truncated."""
    digest = hashlib.sha256(canonical_json(state).encode("utf-8")).digest()
    encoded = base64.b32encode(digest).decode("ascii").lower()
    return encoded.translate(_SLUG_TABLE)[:SLUG_LENGTH]


def is_slug(value: str) -> bool:
    """Whether a path parameter could be one of ours, checked before it reaches a query."""
    return len(value) == SLUG_LENGTH and all(c in _SLUG_ALPHABET for c in value)
