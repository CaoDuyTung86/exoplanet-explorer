"""The time machine's data: what the sky looked like each year, and how a single
planet's measurements were revised over time.

Two different kinds of history live here and they should not be confused.

*Discovery history* is public knowledge — `disc_year` is a column NASA serves, so
"which planets were known in 2009" can be answered by anyone. It is here because the
counts and the per-year highlights are cheaper as one SQL pass than as 6,287 array
passes in every visitor's browser.

*Measurement history* is the part NASA's TAP API genuinely cannot answer. The archive
only ever serves the present: when a radius is refined from 2.1 to 1.8 Earth radii, the
old number is simply gone. Our ingest diffs each run against the last and appends the
superseded values to `planet_history`, so the revisions are ours to replay.

Both reconstructions are pure functions over plain dicts, so they are tested without a
database.
"""

from __future__ import annotations

from datetime import datetime
from typing import Any, Iterable

# Tolerance shared with `ingest._differs`. NASA republishes the same measurement with
# varying precision, and a revision list full of 1e-15 wobbles is noise, not history.
EPSILON = 1e-9

# Fields whose "from → to" is worth showing, in the order they should be displayed.
# A subset of `ingest.TRACKED_FIELDS`: every tracked field is *recorded*, but the ones
# below are the ones a reader can interpret.
REVISION_FIELDS = (
    "pl_rade",
    "pl_bmasse",
    "pl_eqt",
    "pl_orbper",
    "pl_orbsmax",
    "sy_dist",
    "st_teff",
    "st_rad",
    "st_spectype",
    "disc_year",
    "habitability_score",
)


def _changed(old: Any, new: Any) -> bool:
    """Whether two snapshots of one field differ in a way worth reporting."""
    if old is None or new is None:
        return (old is None) != (new is None)
    if isinstance(old, (int, float)) and isinstance(new, (int, float)):
        # bool is an int subclass, but no tracked field is boolean, so this is safe.
        return abs(float(old) - float(new)) > EPSILON
    return old != new


def build_revisions(
    history_rows: Iterable[dict[str, Any]],
    current: dict[str, Any],
) -> list[dict[str, Any]]:
    """Turn `planet_history` rows into a forward-reading list of revisions.

    Each stored row holds the values as they were *before* that run overwrote them, which
    is the cheap thing to write during ingest but the wrong way round for a reader. The
    state *after* run N is therefore the snapshot stored by run N+1, and for the most
    recent run it is the planet's current row.

    `history_rows` must be ordered by run ascending. The result is newest first, because
    that is the order the detail card lists it in.
    """
    rows = list(history_rows)
    revisions: list[dict[str, Any]] = []

    for index, row in enumerate(rows):
        before = row["previous"] or {}
        # The next snapshot is what this run wrote; past the end, the live row is.
        after = rows[index + 1]["previous"] if index + 1 < len(rows) else current
        after = after or {}

        changes = [
            {"field": field, "from": before.get(field), "to": after.get(field)}
            for field in REVISION_FIELDS
            if _changed(before.get(field), after.get(field))
        ]

        # A run can touch a tracked field we do not display (or the diff can wash out
        # under EPSILON), which leaves a row with nothing a reader would see. Reporting
        # it as an empty "revision" would be a lie about what changed.
        if not changes:
            continue

        revisions.append(
            {
                "runId": row["run_id"],
                "changedAt": row["changed_at"],
                "changes": changes,
            }
        )

    revisions.reverse()
    return revisions


def build_timeline(
    year_rows: Iterable[dict[str, Any]],
    notable_rows: Iterable[dict[str, Any]] = (),
) -> dict[str, Any]:
    """Per-year discovery counts, with the gaps filled in and the running total carried.

    Postgres returns only the years that actually have discoveries. A scrubber that
    stepped straight from 1992 to 1995 would make the empty years look like they never
    happened, so every year in the range gets a row — an empty one still advances the
    clock and holds the cumulative count flat, which is the honest picture.
    """
    counts = {int(r["year"]): r for r in year_rows if r["year"] is not None}
    notable = {int(r["year"]): r for r in notable_rows if r["year"] is not None}

    if not counts:
        return {"minYear": None, "maxYear": None, "total": 0, "years": []}

    min_year, max_year = min(counts), max(counts)

    years: list[dict[str, Any]] = []
    cumulative = 0
    cumulative_habitable = 0

    for year in range(min_year, max_year + 1):
        row = counts.get(year)
        count = int(row["count"]) if row else 0
        habitable = int(row["habitable"] or 0) if row else 0
        cumulative += count
        cumulative_habitable += habitable

        entry: dict[str, Any] = {
            "year": year,
            "count": count,
            "cumulative": cumulative,
            "habitable": habitable,
            "cumulativeHabitable": cumulative_habitable,
            "topMethod": (row or {}).get("top_method"),
        }

        highlight = notable.get(year)
        if highlight is not None:
            entry["notable"] = {
                "id": highlight["id"],
                "name": highlight["pl_name"],
                "habitabilityScore": highlight["habitability_score"],
            }

        years.append(entry)

    return {
        "minYear": min_year,
        "maxYear": max_year,
        "total": cumulative,
        "years": years,
    }


def to_iso(value: Any) -> Any:
    """Timestamps go over the wire as ISO-8601 so the client can `new Date()` them."""
    return value.isoformat() if isinstance(value, datetime) else value
