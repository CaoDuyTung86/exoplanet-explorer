"""Finding a planet by name, when the name is half-remembered.

The client already holds every name in the catalog, so this endpoint does not exist to
answer "which names contain this substring" — the browser does that in a millisecond.
It exists because that is the wrong question. People type ``kepler 452b`` for
``Kepler-452 b``, ``trappist 1e`` for ``TRAPPIST-1 e``, and ``keplr`` for either. A
substring filter finds none of those, and the failure is silent: an empty list looks
exactly like "there is no such planet".

Two different problems are hiding in that, and they are solved in two different places:

*Punctuation is deterministic*, not fuzzy. Both the stored names and the query are folded
to lowercase alphanumerics — ``Kepler-452 b`` becomes ``kepler452b`` — so hyphens and
spacing stop existing before anything approximate happens. That fold is a generated
column in Postgres (see ``004_search.sql``) and :func:`normalize` here, and the two
*must* agree; :func:`normalize` is written to mirror the SQL character class exactly.

*Typos are not.* That is what the trigram index is for. Postgres finds candidates — by
literal substring and by trigram similarity, both off the same GIN index — and the
ranking below decides what order they come back in.

The ranking has one rule worth stating outright: **a fuzzy match can never outrank a
literal one**. Trigram scores are capped below the band that substring hits occupy, so
guessing at a typo can add results to the bottom of the list but can never push aside
something the visitor actually typed. Everything here is a pure function over plain
dicts, so the ordering is tested without a database.
"""

from __future__ import annotations

import re
from typing import Any, Iterable

#: Anything that is not a letter or a digit is noise for matching purposes. This has to
#: stay identical to the `regexp_replace` in `004_search.sql`, or the query would be
#: normalised one way and the stored keys another, and nothing would match exactly.
_NON_ALNUM = re.compile(r"[^a-zA-Z0-9]+")

#: Below this, a query is not a search. One character matches a couple of thousand rows
#: whose order would be decided by nothing in particular; returning nothing and letting
#: the caller keep typing is more honest than returning an arbitrary slice of the catalog.
MIN_QUERY_LENGTH = 2

#: Upper bound on results handed back, whatever the caller asks for.
MAX_LIMIT = 25

#: How many rows Postgres is asked for before the ranking below re-orders them. The SQL
#: pre-ranks by the same tiers (exact, then prefix, then trigram), so the true top of the
#: list is inside the pool; the pool exists so that a two-character query matching a few
#: thousand rows does not ship a few thousand rows across the socket.
CANDIDATE_POOL = 400

#: A match on the host star is worth slightly less than the same match on the planet
#: itself. Searching "trappist1" should surface that system's planets, but if some planet
#: were literally named that, it belongs first.
HOST_WEIGHT = 0.95

#: The ceiling for a trigram-only match, and the floor of the substring band below. A
#: typo-tolerant guess sits underneath everything literal, by construction.
FUZZY_CEILING = 0.55


def normalize(text: str | None) -> str:
    """Fold a name or a query to the form the keys are stored in.

    ``"Kepler-452 b"`` and ``"kepler 452B"`` both become ``"kepler452b"``.
    """
    if not text:
        return ""
    return _NON_ALNUM.sub("", text).lower()


def field_score(query: str, key: str | None, trigram: float) -> float:
    """How well one field matches, on a 0-1 scale with meaningful bands.

    ``1.0`` exact · ``0.80-0.95`` the field starts with the query · ``0.60-0.75`` the
    query appears inside it · below ``0.55`` trigram similarity only.

    Inside the two literal bands the score rises with *coverage* — how much of the name
    the query accounts for. It is what puts ``TOI-700 d`` above ``TOI-7001 b`` for the
    query ``toi700``: both contain it, one is almost entirely it.
    """
    if not key or not query:
        return 0.0
    if key == query:
        return 1.0

    coverage = len(query) / len(key)
    if key.startswith(query):
        return 0.80 + 0.15 * coverage
    if query in key:
        return 0.60 + 0.15 * coverage

    # Nothing literal matched, so whatever the trigram index thought of it — capped, so
    # a near-miss cannot displace a real substring hit.
    return min(FUZZY_CEILING, max(0.0, trigram))


def score_row(query: str, row: dict[str, Any]) -> tuple[float, str]:
    """Best score for one candidate row, and which field earned it."""
    name = field_score(query, row.get("name_key"), _as_float(row.get("name_sim")))
    host = field_score(query, row.get("host_key"), _as_float(row.get("host_sim"))) * HOST_WEIGHT

    if host > name:
        return host, "host"
    return name, "name"


def _as_float(value: Any) -> float:
    try:
        return float(value)
    except (TypeError, ValueError):
        return 0.0


def _sort_key(result: dict[str, Any]) -> tuple[float, float, str]:
    """Score first; then the nearer planet; then the name, so ties are not arbitrary.

    Distance breaks ties rather than habitability on purpose. Every planet in a system
    scores the same on a host match, and "which of the TRAPPIST-1 planets did you mean"
    has no good answer — but a stable, explainable order beats whatever the index
    happened to return, and re-running the same search must not reshuffle the list.
    """
    distance = result.get("distanceLy")
    return (
        -result["score"],
        distance if isinstance(distance, (int, float)) else float("inf"),
        result["name"] or "",
    )


def rank(query: str, rows: Iterable[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    """Order candidate rows and shape them for the wire.

    Rows that score zero are dropped: Postgres was asked a deliberately generous question
    (trigram similarity *or* substring) and some of what comes back is only a near-miss
    on a threshold, which is not something to show a person.
    """
    normalized = normalize(query)
    if len(normalized) < MIN_QUERY_LENGTH:
        return []

    results: list[dict[str, Any]] = []
    for row in rows:
        score, matched_on = score_row(normalized, row)
        if score <= 0:
            continue
        results.append(
            {
                "id": row["id"],
                "name": row["pl_name"],
                "hostname": row["hostname"],
                # Rounded because the third decimal of a heuristic is not information,
                # and the client shows this as a bar.
                "score": round(score, 3),
                "matchedOn": matched_on,
                "distanceLy": row.get("distance_ly"),
                "habitabilityScore": row.get("habitability_score"),
                "isHabitable": row.get("is_habitable"),
                "sizeCategory": row.get("size_category"),
                "discYear": row.get("disc_year"),
                "discoveryMethod": row.get("discoverymethod"),
                "isSolarSystem": row.get("is_solar_system"),
            }
        )

    results.sort(key=_sort_key)
    return results[: max(1, limit)]


def clamp_limit(limit: int) -> int:
    return max(1, min(MAX_LIMIT, limit))
