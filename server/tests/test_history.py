"""Tests for the time machine's two reconstructions.

`planet_history` stores the values a run *replaced*, which is the cheap thing to write
but the wrong way round to read. Everything worth getting wrong is in that inversion, so
these tests pin down which snapshot supplies the "after" of each revision.
"""

from __future__ import annotations

from datetime import datetime, timezone

from app import history


def hrow(run_id: int, previous, at: str = "2026-01-01T00:00:00+00:00") -> dict:
    return {
        "run_id": run_id,
        "changed_at": datetime.fromisoformat(at),
        "previous": previous,
    }


# --------------------------------------------------------------------------------------
# build_revisions
# --------------------------------------------------------------------------------------


def test_no_history_means_no_revisions():
    assert history.build_revisions([], {"pl_rade": 1.6}) == []


def test_single_row_compares_against_the_live_planet():
    """The most recent run has no successor, so the current row is its "after"."""
    revisions = history.build_revisions([hrow(7, {"pl_rade": 2.1})], {"pl_rade": 1.8})

    assert len(revisions) == 1
    assert revisions[0]["runId"] == 7
    assert revisions[0]["changes"] == [{"field": "pl_rade", "from": 2.1, "to": 1.8}]


def test_middle_run_compares_against_the_next_snapshot_not_the_current_row():
    """The value run N wrote is the value run N+1 recorded as previous.

    Reading the live row for every revision would report each older run as if it had
    jumped straight to today's number.
    """
    revisions = history.build_revisions(
        [hrow(1, {"pl_rade": 3.0}), hrow(2, {"pl_rade": 2.1})],
        {"pl_rade": 1.8},
    )

    assert [r["runId"] for r in revisions] == [2, 1]  # newest first
    newest, oldest = revisions
    assert oldest["changes"] == [{"field": "pl_rade", "from": 3.0, "to": 2.1}]
    assert newest["changes"] == [{"field": "pl_rade", "from": 2.1, "to": 1.8}]


def test_revisions_are_returned_newest_first():
    revisions = history.build_revisions(
        [hrow(1, {"pl_eqt": 300.0}), hrow(4, {"pl_eqt": 280.0}), hrow(9, {"pl_eqt": 265.0})],
        {"pl_eqt": 260.0},
    )
    assert [r["runId"] for r in revisions] == [9, 4, 1]


def test_several_fields_change_in_one_run():
    revisions = history.build_revisions(
        [hrow(3, {"pl_rade": 2.0, "pl_bmasse": 5.0, "st_teff": 5700.0})],
        {"pl_rade": 1.8, "pl_bmasse": 5.0, "st_teff": 5757.0},
    )

    fields = [c["field"] for c in revisions[0]["changes"]]
    # pl_bmasse did not move, so it is absent; order follows REVISION_FIELDS.
    assert fields == ["pl_rade", "st_teff"]


def test_float_noise_below_epsilon_is_not_a_revision():
    """NASA republishes the same measurement at different precision. That is not news."""
    revisions = history.build_revisions(
        [hrow(2, {"pl_rade": 1.8})], {"pl_rade": 1.8 + 1e-12}
    )
    assert revisions == []


def test_run_that_only_touched_undisplayed_fields_is_dropped():
    """`ingest.TRACKED_FIELDS` is wider than what the card can render. A revision with
    nothing to show would be an empty row claiming something happened."""
    revisions = history.build_revisions(
        [hrow(5, {"pl_rade": 1.8, "some_untracked_extra": "a"})],
        {"pl_rade": 1.8, "some_untracked_extra": "b"},
    )
    assert revisions == []


def test_value_appearing_where_there_was_none_counts_as_a_change():
    revisions = history.build_revisions([hrow(2, {"pl_bmasse": None})], {"pl_bmasse": 5.0})
    assert revisions[0]["changes"] == [{"field": "pl_bmasse", "from": None, "to": 5.0}]


def test_value_disappearing_counts_as_a_change():
    revisions = history.build_revisions([hrow(2, {"pl_bmasse": 5.0})], {"pl_bmasse": None})
    assert revisions[0]["changes"] == [{"field": "pl_bmasse", "from": 5.0, "to": None}]


def test_string_fields_compare_exactly():
    revisions = history.build_revisions(
        [hrow(2, {"st_spectype": "G2V"})], {"st_spectype": "G5V"}
    )
    assert revisions[0]["changes"] == [{"field": "st_spectype", "from": "G2V", "to": "G5V"}]


def test_missing_key_is_treated_as_absent_not_as_an_error():
    """Older history rows predate any field added to TRACKED_FIELDS later."""
    revisions = history.build_revisions([hrow(2, {})], {"pl_rade": 1.8})
    assert revisions[0]["changes"] == [{"field": "pl_rade", "from": None, "to": 1.8}]


def test_null_previous_snapshot_does_not_crash():
    revisions = history.build_revisions([hrow(2, None)], {"pl_rade": 1.8})
    assert revisions[0]["changes"] == [{"field": "pl_rade", "from": None, "to": 1.8}]


def test_changed_at_is_carried_through_unchanged():
    """The route converts to ISO; the reconstruction leaves the value alone."""
    at = datetime(2026, 3, 1, tzinfo=timezone.utc)
    revisions = history.build_revisions(
        [hrow(2, {"pl_rade": 2.0}, at="2026-03-01T00:00:00+00:00")], {"pl_rade": 1.8}
    )
    assert revisions[0]["changedAt"] == at


# --------------------------------------------------------------------------------------
# build_timeline
# --------------------------------------------------------------------------------------


def yrow(year, count: int, habitable: int = 0, method: str = "Transit") -> dict:
    return {"year": year, "count": count, "habitable": habitable, "top_method": method}


def test_empty_catalog_yields_an_empty_timeline():
    assert history.build_timeline([]) == {
        "minYear": None,
        "maxYear": None,
        "total": 0,
        "years": [],
    }


def test_cumulative_count_accumulates():
    result = history.build_timeline([yrow(1992, 2), yrow(1993, 3), yrow(1994, 5)])
    assert [y["cumulative"] for y in result["years"]] == [2, 5, 10]
    assert result["total"] == 10


def test_years_with_no_discoveries_are_filled_in():
    """Postgres only returns years that have rows. Skipping 1993-1994 would make the
    scrubber jump and hide the fact that nothing was found."""
    result = history.build_timeline([yrow(1992, 2), yrow(1995, 1)])

    assert [y["year"] for y in result["years"]] == [1992, 1993, 1994, 1995]
    assert [y["count"] for y in result["years"]] == [2, 0, 0, 1]
    # An empty year advances the clock without moving the running total.
    assert [y["cumulative"] for y in result["years"]] == [2, 2, 2, 3]
    assert result["minYear"] == 1992
    assert result["maxYear"] == 1995


def test_filled_year_carries_no_notable_planet():
    result = history.build_timeline(
        [yrow(1992, 1), yrow(1994, 1)],
        [{"year": 1992, "id": "a", "pl_name": "A", "habitability_score": 10}],
    )
    by_year = {y["year"]: y for y in result["years"]}
    assert by_year[1992]["notable"]["name"] == "A"
    assert "notable" not in by_year[1993]
    assert "notable" not in by_year[1994]


def test_habitable_counts_accumulate_separately():
    result = history.build_timeline(
        [yrow(2014, 10, habitable=1), yrow(2015, 20, habitable=2)]
    )
    assert [y["cumulativeHabitable"] for y in result["years"]] == [1, 3]


def test_null_habitable_count_is_treated_as_zero():
    rows = [{"year": 2001, "count": 4, "habitable": None, "top_method": "Transit"}]
    result = history.build_timeline(rows)
    assert result["years"][0]["habitable"] == 0


def test_top_method_is_carried_through():
    result = history.build_timeline([yrow(1992, 2, method="Pulsar Timing")])
    assert result["years"][0]["topMethod"] == "Pulsar Timing"


def test_rows_with_a_null_year_are_ignored():
    rows = [yrow(2000, 1), yrow(None, 9)]
    result = history.build_timeline(rows)
    assert result["total"] == 1
    assert result["minYear"] == 2000


def test_single_year_catalog():
    result = history.build_timeline([yrow(2020, 7)])
    assert result["minYear"] == result["maxYear"] == 2020
    assert len(result["years"]) == 1


def test_to_iso_formats_datetimes_and_passes_everything_else_through():
    at = datetime(2026, 3, 1, 12, 0, tzinfo=timezone.utc)
    assert history.to_iso(at) == "2026-03-01T12:00:00+00:00"
    assert history.to_iso(None) is None
    assert history.to_iso(7) == 7
