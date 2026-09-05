"""Tests for what a permalink is allowed to say, and what it is called.

Everything here is the pure half of the feature: `canonical_state` and `slug_for`. The
table in `005_share.sql` only ever stores what comes out of these, so the properties that
matter — that the same view is the same link, that a link never contradicts itself, that
a browser cannot store arbitrary values — are settled without a database.
"""

from __future__ import annotations

import pytest

from app import share
from app.security import ValidationError


def test_empty_state_is_just_the_version():
    """A default view has nothing to say, and says nothing."""
    assert share.canonical_state({}) == {"version": share.STATE_VERSION}


def test_defaults_are_not_stored():
    """A slider left where it was found is not an opinion the link should carry."""
    state = share.canonical_state(
        {"filters": {"radiusRange": [0, 30], "showHabitableOnly": False, "searchQuery": ""}}
    )
    assert "filters" not in state


def test_changed_filters_survive():
    state = share.canonical_state(
        {"filters": {"radiusRange": [0.5, 2.5], "showHabitableOnly": True}}
    )
    assert state["filters"] == {"radiusRange": [0.5, 2.5], "showHabitableOnly": True}


def test_unknown_filter_keys_are_dropped():
    """The key set is fixed here, not taken from whatever the client sent."""
    state = share.canonical_state({"filters": {"radiusRange": [1, 2], "sqlInjection": "; DROP"}})
    assert state["filters"] == {"radiusRange": [1, 2]}


# --- the same view is the same link ------------------------------------------------


def test_slug_is_stable_across_calls():
    state = share.canonical_state({"filters": {"tempRange": [200, 320]}, "focus": "kepler-452-b"})
    assert share.slug_for(state) == share.slug_for(share.canonical_state(dict(
        filters={"tempRange": [200, 320]}, focus="kepler-452-b"
    )))


def test_list_order_does_not_change_the_link():
    """Ticking two boxes in the other order is the same view, so it is the same link."""
    one = share.canonical_state({"filters": {"discoveryMethods": ["Transit", "Microlensing"]}})
    other = share.canonical_state({"filters": {"discoveryMethods": ["Microlensing", "Transit"]}})
    assert one == other
    assert share.slug_for(one) == share.slug_for(other)


def test_duplicates_and_blanks_in_a_list_are_folded_away():
    state = share.canonical_state(
        {"filters": {"spectralTypes": ["G", "G", "  ", " K "]}}
    )
    assert state["filters"]["spectralTypes"] == ["G", "K"]


def test_returning_a_slider_to_its_default_gives_back_the_first_link():
    """The round trip a visitor actually makes: nudge a filter, undo it, share again."""
    plain = share.canonical_state({"focus": "trappist-1-e"})
    nudged = share.canonical_state({"focus": "trappist-1-e", "filters": {"massRange": [1, 5]}})
    restored = share.canonical_state(
        {"focus": "trappist-1-e", "filters": {"massRange": [0, 10000]}}
    )

    assert share.slug_for(nudged) != share.slug_for(plain)
    assert share.slug_for(restored) == share.slug_for(plain)


def test_different_views_get_different_slugs():
    a = share.canonical_state({"focus": "kepler-452-b"})
    b = share.canonical_state({"focus": "kepler-186-f"})
    assert share.slug_for(a) != share.slug_for(b)


def test_slug_shape():
    slug = share.slug_for(share.canonical_state({"focus": "kepler-452-b"}))
    assert share.is_slug(slug)
    assert len(slug) == share.SLUG_LENGTH
    # No i, l, o or u: a slug retyped from a screenshot has no lookalike pairs.
    assert not set(slug) & set("ilou")


@pytest.mark.parametrize(
    "value",
    ["", "short", "KEPLER4520", "kepler452b!", "iiiiiiiiii", "0123456789a"],
)
def test_is_slug_rejects_anything_we_did_not_mint(value):
    assert not share.is_slug(value)


# --- a link never contradicts itself ------------------------------------------------


def test_camera_is_dropped_when_a_planet_is_focused():
    """With a planet selected the camera is derived from it, frame by frame."""
    state = share.canonical_state(
        {
            "focus": "kepler-452-b",
            "camera": {"position": [10, 20, 30], "target": [0, 0, 0]},
        }
    )
    assert state["focus"] == "kepler-452-b"
    assert "camera" not in state


def test_camera_is_kept_for_the_free_look_view():
    state = share.canonical_state({"camera": {"position": [10, 20, 30], "target": [0, 0, 0]}})
    assert state["camera"] == {"position": [10.0, 20.0, 30.0], "target": [0.0, 0.0, 0.0]}


def test_camera_is_rounded_so_two_resting_views_agree():
    """A frame of damping moves the camera less than this; it should not change the link."""
    a = share.canonical_state({"camera": {"position": [10.001, 20, 30], "target": [0, 0, 1]}})
    b = share.canonical_state({"camera": {"position": [10.0009, 20, 30], "target": [0, 0, 1]}})
    assert share.slug_for(a) == share.slug_for(b)


def test_camera_on_its_own_target_is_rejected():
    with pytest.raises(ValidationError):
        share.canonical_state({"camera": {"position": [1, 2, 3], "target": [1, 2, 3]}})


def test_default_view_mode_is_not_recorded():
    assert "view" not in share.canonical_state({"view": "3d"})
    assert share.canonical_state({"view": "table"})["view"] == "table"


# --- a browser cannot store whatever it likes ---------------------------------------


def test_reversed_range_is_swapped_not_rejected():
    """A slider read backwards is still a view someone had."""
    state = share.canonical_state({"filters": {"tempRange": [500, 100]}})
    assert state["filters"]["tempRange"] == [100.0, 500.0]


def test_ranges_are_clamped_to_the_scene():
    state = share.canonical_state({"filters": {"radiusRange": [-1e9, 1e9]}})
    assert state["filters"]["radiusRange"] == [0.0, 1000.0]


@pytest.mark.parametrize(
    "filters",
    [
        {"radiusRange": [float("nan"), 5]},
        {"radiusRange": [float("inf"), 5]},
        {"radiusRange": [1, 2, 3]},
        {"radiusRange": "0,30"},
        {"radiusRange": [True, 5]},
        {"showHabitableOnly": "yes"},
        {"searchQuery": 42},
        {"discoveryMethods": "Transit"},
        {"discoveryMethods": [1, 2]},
        {"spectralTypes": ["G" * 60]},
        {"discoveryMethods": ["x"] * 40},
    ],
)
def test_malformed_filters_are_rejected(filters):
    with pytest.raises(ValidationError):
        share.canonical_state({"filters": filters})


@pytest.mark.parametrize(
    "focus",
    ["Kepler-452-b", "kepler 452 b", "../../etc/passwd", "-leading-dash", "a" * 90, 7],
)
def test_focus_must_look_like_an_id_ingest_would_mint(focus):
    with pytest.raises(ValidationError):
        share.canonical_state({"focus": focus})


def test_search_query_is_truncated_not_rejected():
    state = share.canonical_state({"filters": {"searchQuery": "k" * 500}})
    assert len(state["filters"]["searchQuery"]) == 100


@pytest.mark.parametrize("year", [1500.5, "2009", True, 5000, 800])
def test_bad_timeline_years_are_rejected(year):
    with pytest.raises(ValidationError):
        share.canonical_state({"timelineYear": year})


def test_timeline_year_survives():
    assert share.canonical_state({"timelineYear": 2009})["timelineYear"] == 2009


@pytest.mark.parametrize("bad", ["table3d", "TABLE", "list", 3])
def test_unknown_view_modes_are_rejected(bad):
    with pytest.raises(ValidationError):
        share.canonical_state({"view": bad})


@pytest.mark.parametrize(
    "camera",
    [
        {"position": [0, 0], "target": [0, 0, 0]},
        {"position": [0, 0, 0]},
        {"position": [1e6, 0, 0], "target": [0, 0, 0]},
        {"position": "0,0,0", "target": [0, 0, 0]},
    ],
)
def test_malformed_cameras_are_rejected(camera):
    with pytest.raises(ValidationError):
        share.canonical_state({"camera": camera})


@pytest.mark.parametrize("bad", ["not a dict", 5, ["filters"], None])
def test_state_must_be_an_object(bad):
    with pytest.raises(ValidationError):
        share.canonical_state(bad)


# --- the canonical form is what gets hashed -----------------------------------------


def test_canonical_json_is_key_order_independent():
    state = share.canonical_state({"focus": "kepler-452-b", "timelineYear": 2015})
    shuffled = {k: state[k] for k in reversed(list(state))}
    assert share.canonical_json(state) == share.canonical_json(shuffled)


def test_version_is_part_of_the_hash():
    """A v2 state that happens to look like a v1 one must not answer to its link."""
    v1 = {"version": 1, "focus": "kepler-452-b"}
    v2 = {"version": 2, "focus": "kepler-452-b"}
    assert share.slug_for(v1) != share.slug_for(v2)


def test_default_filters_match_the_clients_copy():
    """Guards the one duplicated constant in the feature.

    `DEFAULT_FILTERS` here mirrors the TypeScript object; if they drift, filters stop
    being recognised as defaults and links quietly start pinning them.
    """
    from pathlib import Path
    import re

    source = (
        Path(__file__).resolve().parents[2] / "src" / "features" / "explorer" / "types" / "index.ts"
    ).read_text(encoding="utf-8")

    block = re.search(r"DEFAULT_FILTERS: FilterState = \{(.*?)\n\}", source, re.S)
    assert block, "DEFAULT_FILTERS not found in the TypeScript types"

    for key, default in share.DEFAULT_FILTERS.items():
        entry = re.search(rf"^\s*{key}:\s*(.+?),\s*(?://.*)?$", block.group(1), re.M)
        assert entry, f"{key} is missing from the TypeScript DEFAULT_FILTERS"

        literal = entry.group(1).strip()
        if isinstance(default, bool):
            assert literal == str(default).lower()
        elif isinstance(default, str):
            assert literal.strip("'\"") == default
        else:
            numbers = [float(n) for n in re.findall(r"-?\d+(?:\.\d+)?", literal)]
            assert numbers == [float(v) for v in default]
