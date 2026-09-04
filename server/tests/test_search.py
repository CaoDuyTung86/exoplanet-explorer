"""Tests for the ranking behind /v1/search.

The trigram index is Postgres's problem and is not re-tested here. What is tested is
everything that decides what comes back *first*: the punctuation fold — which has to
agree exactly with the generated column in `004_search.sql` or nothing matches — and the
rule that a fuzzy guess can never displace something the visitor literally typed.
"""

from __future__ import annotations

from app import search


def row(
    planet_id: str,
    name: str,
    host: str,
    *,
    name_sim: float = 0.0,
    host_sim: float = 0.0,
    distance: float | None = 100.0,
) -> dict:
    """A candidate row shaped like the one SEARCH_SQL returns."""
    return {
        "id": planet_id,
        "pl_name": name,
        "hostname": host,
        "name_key": search.normalize(name),
        "host_key": search.normalize(host),
        "name_sim": name_sim,
        "host_sim": host_sim,
        "distance_ly": distance,
        "habitability_score": 40,
        "is_habitable": False,
        "size_category": "super-earth",
        "disc_year": 2015,
        "discoverymethod": "Transit",
        "is_solar_system": False,
    }


def names(results: list[dict]) -> list[str]:
    return [r["name"] for r in results]


# --------------------------------------------------------------------------------------
# normalize — the half of the problem that is not fuzzy at all
# --------------------------------------------------------------------------------------


def test_the_fold_erases_case_spacing_and_hyphens():
    assert search.normalize("Kepler-452 b") == "kepler452b"
    assert search.normalize("kepler 452B") == "kepler452b"
    assert search.normalize("KEPLER452B") == "kepler452b"


def test_the_fold_keeps_only_letters_and_digits():
    """This has to mirror the regexp_replace in 004_search.sql character for character."""
    assert search.normalize("PSR B1257+12 c") == "psrb125712c"
    assert search.normalize("  ") == ""
    assert search.normalize(None) == ""


def test_a_query_of_pure_punctuation_finds_nothing():
    """It folds to an empty string, which must not be read as "match everything"."""
    assert search.rank("---", [row("a", "Kepler-452 b", "Kepler-452")], 8) == []


def test_a_single_character_is_not_yet_a_search():
    assert search.rank("k", [row("a", "Kepler-452 b", "Kepler-452")], 8) == []


# --------------------------------------------------------------------------------------
# field_score — the bands
# --------------------------------------------------------------------------------------


def test_an_exact_match_is_the_top_of_the_scale():
    assert search.field_score("kepler452b", "kepler452b", 0.0) == 1.0


def test_prefix_outranks_substring_outranks_trigram():
    prefix = search.field_score("kepler", "kepler452b", 0.9)
    inside = search.field_score("452", "kepler452b", 0.9)
    fuzzy = search.field_score("keplr452b", "kepler452b", 0.9)

    assert prefix > inside > fuzzy


def test_a_trigram_score_can_never_reach_the_literal_bands():
    """A near-miss adds results to the bottom of the list; it never reorders the top."""
    perfect_typo = search.field_score("zzzz", "kepler452b", 1.0)
    worst_substring = search.field_score("452", "kepler452bbbbbbbbbbbbbbbbbbbb", 0.0)

    assert perfect_typo <= search.FUZZY_CEILING < worst_substring


def test_coverage_breaks_ties_inside_a_band():
    """Both start with the query; one of them is almost entirely the query."""
    tight = search.field_score("toi700", "toi700d", 0.0)
    loose = search.field_score("toi700", "toi7001b", 0.0)

    assert tight > loose


def test_an_empty_key_scores_nothing():
    assert search.field_score("kepler", "", 0.9) == 0.0
    assert search.field_score("kepler", None, 0.9) == 0.0


# --------------------------------------------------------------------------------------
# score_row — planet name versus host star
# --------------------------------------------------------------------------------------


def test_the_same_match_is_worth_more_on_the_planet_than_on_its_star():
    on_name = search.score_row("trappist1", row("a", "TRAPPIST-1", "Something Else"))
    on_host = search.score_row("trappist1", row("b", "Something Else", "TRAPPIST-1"))

    assert on_name == (1.0, "name")
    assert on_host[1] == "host"
    assert on_host[0] < on_name[0]


def test_a_host_match_still_surfaces_the_system():
    """Typing a star name is how you ask for its planets."""
    results = search.rank(
        "trappist1",
        [
            row("t-e", "TRAPPIST-1 e", "TRAPPIST-1", distance=40.0),
            row("far", "Kepler-9 b", "Kepler-9", distance=2000.0),
        ],
        8,
    )

    assert names(results) == ["TRAPPIST-1 e"]
    assert results[0]["matchedOn"] == "host"


def test_a_missing_similarity_column_is_not_an_error():
    """Rows arrive from asyncpg; a NULL similarity must degrade to "no fuzzy match"."""
    candidate = row("a", "Kepler-452 b", "Kepler-452")
    candidate["name_sim"] = None
    candidate["host_sim"] = None

    score, matched_on = search.score_row("kepler452b", candidate)

    assert (score, matched_on) == (1.0, "name")


# --------------------------------------------------------------------------------------
# rank — the ordering the dropdown shows
# --------------------------------------------------------------------------------------


def test_the_literal_match_leads_even_when_a_typo_scores_higher_at_the_index():
    """The whole point: pg_trgm's opinion does not get to reorder what was typed."""
    results = search.rank(
        "kepler452",
        [
            row("typo", "Kepler-4 b", "Kepler-4", name_sim=0.95),
            row("real", "Kepler-452 b", "Kepler-452", name_sim=0.4),
        ],
        8,
    )

    assert names(results) == ["Kepler-452 b", "Kepler-4 b"]


def test_rows_that_match_nothing_are_dropped():
    """Postgres is asked a generous question; not everything it returns is a result."""
    results = search.rank(
        "kepler452",
        [
            row("hit", "Kepler-452 b", "Kepler-452"),
            row("miss", "HD 209458 b", "HD 209458"),
        ],
        8,
    )

    assert names(results) == ["Kepler-452 b"]


def test_ties_are_broken_by_distance_then_name():
    """Every planet in a system scores the same on a host match; the order still has to
    come out the same on every request rather than however the index returned them."""
    candidates = [
        row("c", "TRAPPIST-1 g", "TRAPPIST-1", distance=40.0),
        row("a", "TRAPPIST-1 e", "TRAPPIST-1", distance=40.0),
        row("b", "TRAPPIST-1 b", "TRAPPIST-1", distance=39.0),
    ]

    first = names(search.rank("trappist1", candidates, 8))
    second = names(search.rank("trappist1", list(reversed(candidates)), 8))

    assert first == ["TRAPPIST-1 b", "TRAPPIST-1 e", "TRAPPIST-1 g"]
    assert first == second


def test_a_planet_with_no_distance_sorts_last_rather_than_first():
    results = search.rank(
        "kepler",
        [
            row("unknown", "Kepler-9 b", "Kepler-9", distance=None),
            row("known", "Kepler-9 c", "Kepler-9", distance=600.0),
        ],
        8,
    )

    assert names(results) == ["Kepler-9 c", "Kepler-9 b"]


def test_the_limit_is_honoured_and_clamped():
    candidates = [row(f"k{i}", f"Kepler-{i} b", f"Kepler-{i}") for i in range(40)]

    assert len(search.rank("kepler", candidates, 5)) == 5
    assert search.clamp_limit(0) == 1
    assert search.clamp_limit(9999) == search.MAX_LIMIT


def test_a_result_carries_what_the_dropdown_draws():
    """A match should never need a second request just to be shown."""
    (result,) = search.rank("kepler452b", [row("a", "Kepler-452 b", "Kepler-452")], 8)

    assert result["id"] == "a"
    assert result["hostname"] == "Kepler-452"
    assert result["score"] == 1.0
    assert result["discYear"] == 2015
    assert result["sizeCategory"] == "super-earth"
    assert result["isSolarSystem"] is False


def test_punctuation_in_the_query_does_not_change_the_answer():
    candidates = [row("a", "Kepler-452 b", "Kepler-452")]

    for typed in ("kepler 452 b", "KEPLER-452B", "kepler452b", "  Kepler-452 b  "):
        assert names(search.rank(typed, candidates, 8)) == ["Kepler-452 b"]
