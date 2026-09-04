"""Tests for the feature space "find planets like this one" ranks in.

The k-NN itself is Postgres's job and is not re-tested here. What is tested is
everything that decides *what* the distance is measured over: the log transform, the
standardisation, and — the part with the most room to quietly lie — which dimensions a
planet actually measured versus which were imputed to the population mean.
"""

from __future__ import annotations

import math

from app import similarity


def stats_from(*values: tuple[float, float]) -> list[similarity.FeatureStat]:
    """Hand-built statistics, one (mean, stddev) pair per feature, in FEATURES order."""
    return [
        similarity.FeatureStat(i, similarity.FEATURE_NAMES[i], mean, stddev, 100)
        for i, (mean, stddev) in enumerate(values)
    ]


#: Mean 0 / stddev 1 on every axis, so a coordinate is just the transformed value.
IDENTITY_STATS = stats_from((0.0, 1.0), (0.0, 1.0), (0.0, 1.0), (0.0, 1.0))


# --------------------------------------------------------------------------------------
# raw_value / transform
# --------------------------------------------------------------------------------------


def test_insolation_falls_back_to_the_derived_formula():
    """The Solar System rows are seeded with no insolation, and Earth has to have one."""
    earth = {"insolation": None, "st_rad": 1.0, "st_teff": 5778.0, "pl_orbsmax": 1.0}

    assert similarity.raw_value(earth, "insolation") == 1.0041644920266215


def test_stored_insolation_wins_over_recomputing_it():
    row = {"insolation": 4.0, "st_rad": 1.0, "st_teff": 5778.0, "pl_orbsmax": 1.0}

    assert similarity.raw_value(row, "insolation") == 4.0


def test_a_non_finite_value_counts_as_missing():
    assert similarity.raw_value({"pl_rade": float("nan")}, "pl_rade") is None
    assert similarity.raw_value({"pl_rade": float("inf")}, "pl_rade") is None


def test_log_dimensions_are_log10_and_linear_ones_are_untouched():
    radius, teff = similarity.FEATURES[0], similarity.FEATURES[3]

    assert similarity.transform(radius, 100.0) == 2.0
    assert similarity.transform(teff, 5778.0) == 5778.0


def test_a_non_positive_value_on_a_log_axis_is_missing_not_tiny():
    """A zero radius is a bad row, not the smallest planet ever found."""
    radius = similarity.FEATURES[0]

    assert similarity.transform(radius, 0.0) is None
    assert similarity.transform(radius, -1.0) is None


# --------------------------------------------------------------------------------------
# build_stats
# --------------------------------------------------------------------------------------


def test_stats_are_computed_over_measured_rows_only():
    rows = [
        {"pl_rade": 1.0},    # log10 -> 0
        {"pl_rade": 10.0},   # log10 -> 1
        {"pl_rade": None},   # ignored entirely, not counted as a zero
    ]

    radius = similarity.build_stats(rows)[0]

    assert radius.feature == "pl_rade"
    assert radius.measured_count == 2
    assert radius.mean == 0.5
    assert radius.stddev == 0.5


def test_a_dimension_with_no_spread_gets_a_stddev_of_one():
    """Otherwise standardising it divides by zero."""
    rows = [{"st_teff": 5000.0}, {"st_teff": 5000.0}]

    assert similarity.build_stats(rows)[3].stddev == 1.0


def test_a_dimension_nobody_measured_still_produces_a_stat():
    stats = similarity.build_stats([{"pl_rade": 1.0}])

    mass = stats[1]
    assert mass.measured_count == 0
    assert (mass.mean, mass.stddev) == (0.0, 1.0)


# --------------------------------------------------------------------------------------
# feature_vector
# --------------------------------------------------------------------------------------


def test_coordinates_are_standardised_against_the_population():
    stats = stats_from((0.5, 0.5), (0.0, 1.0), (0.0, 1.0), (5000.0, 1000.0))
    row = {"pl_rade": 10.0, "pl_bmasse": 1.0, "insolation": 1.0, "st_teff": 6000.0}

    coords, mask = similarity.feature_vector(row, stats)

    assert mask == 0b1111
    assert coords is not None
    # log10(10) = 1, one standard deviation above a mean of 0.5.
    assert math.isclose(coords[0], 1.0)
    assert math.isclose(coords[3], 1.0)


def test_a_missing_dimension_lands_on_the_mean_and_clears_its_mask_bit():
    row = {"pl_rade": 1.0, "pl_bmasse": None, "insolation": 1.0, "st_teff": 5000.0}

    coords, mask = similarity.feature_vector(row, IDENTITY_STATS)

    assert coords is not None
    assert coords[1] == 0.0             # the population mean, in standardised units
    assert mask & 0b0010 == 0           # ...and it does not claim to be measured
    assert similarity.measured_fields(mask) == ["pl_rade", "insolation", "st_teff"]


def test_too_few_measurements_means_no_vector_at_all():
    """One axis out of four: "nearest" would mean little more than "also average"."""
    coords, mask = similarity.feature_vector({"pl_rade": 1.0}, IDENTITY_STATS)

    assert coords is None
    assert similarity.measured_fields(mask) == ["pl_rade"]


def test_two_measurements_are_enough():
    coords, _ = similarity.feature_vector(
        {"pl_rade": 1.0, "st_teff": 5000.0}, IDENTITY_STATS
    )

    assert coords is not None


# --------------------------------------------------------------------------------------
# Wire format
# --------------------------------------------------------------------------------------


def test_cube_literal_is_what_postgres_parses():
    assert similarity.cube_literal((1.5, -0.25, 0.0, 2.0)) == (
        "(1.500000, -0.250000, 0.000000, 2.000000)"
    )


def test_no_vector_means_no_literal():
    assert similarity.cube_literal(None) is None


# --------------------------------------------------------------------------------------
# Presentation
# --------------------------------------------------------------------------------------


def test_identical_planets_read_as_a_perfect_match():
    assert similarity.similarity_percent(0.0) == 100


def test_the_match_reading_falls_off_with_distance():
    readings = [similarity.similarity_percent(d) for d in (0.0, 0.5, 1.0, 2.0, 4.0)]

    assert readings == sorted(readings, reverse=True)
    assert readings[-1] == 0


def test_a_nonsense_distance_reads_zero_rather_than_raising():
    assert similarity.similarity_percent(float("nan")) == 0
    assert similarity.similarity_percent(-1.0) == 0


def test_ratios_only_cover_fields_both_planets_measured():
    subject = {"pl_rade": 1.0, "pl_bmasse": 2.0, "st_teff": 5000.0}
    neighbour = {"pl_rade": 1.5, "pl_bmasse": None, "st_teff": 5500.0}

    ratios = similarity.field_ratios(subject, neighbour)

    assert ratios["pl_rade"] == 1.5
    assert ratios["st_teff"] == 1.1
    assert "pl_bmasse" not in ratios      # imputed on one side; a ratio would be fiction
    assert "insolation" not in ratios     # measured on neither


def test_a_zero_on_the_subject_never_becomes_a_division_by_zero():
    ratios = similarity.field_ratios({"st_teff": 0.0}, {"st_teff": 5000.0})

    assert ratios == {}
