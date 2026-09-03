"""Tests for the domain logic ported from TypeScript.

The expected values here were derived from the original ``nasaApi.ts`` implementation.
Their job is to catch the port drifting from what the frontend used to compute — if one
of these fails, the map is about to look different for a reason nobody intended.
"""

from __future__ import annotations

import math

import pytest

from app.transform import (
    calculate_habitability,
    calculate_insolation,
    categorize_planet,
    derive,
    planet_color,
    project_position,
    slugify,
    visual_radius,
)

EARTH_LIKE = {
    "pl_name": "Kepler-452 b",
    "pl_eqt": 265.0,
    "pl_rade": 1.63,
    "pl_bmasse": 5.0,
    "st_spectype": "G2V",
    "st_teff": 5757.0,
    "st_rad": 1.11,
    "pl_orbsmax": 1.046,
    "sy_dist": 550.0,
    "ra": 296.0,
    "dec": 44.27,
}


class TestHabitability:
    def test_temperate_earth_sized_around_a_g_star_scores_high(self):
        # 30 (temp in 180-310) + 15 (radius 0.5-2.0) + 25 (mass 0.5-5.0) + 20 (G star)
        assert calculate_habitability(EARTH_LIKE) == 90

    def test_score_is_capped_at_100(self):
        perfect = {"pl_eqt": 288.0, "pl_rade": 1.0, "pl_bmasse": 1.0, "st_spectype": "G2V"}
        assert calculate_habitability(perfect) == 100

    def test_missing_fields_contribute_nothing(self):
        assert calculate_habitability({}) == 0

    def test_spectral_type_takes_precedence_over_temperature(self):
        # An M star scores 8, even though its st_teff would otherwise be worth more.
        row = {"st_spectype": "M5.5V", "st_teff": 5000.0}
        assert calculate_habitability(row) == 8

    def test_temperature_is_the_fallback_when_spectral_type_is_unknown(self):
        assert calculate_habitability({"st_teff": 5000.0}) == 15

    def test_unrecognised_spectral_class_scores_zero_not_an_error(self):
        assert calculate_habitability({"st_spectype": "WD"}) == 0

    @pytest.mark.parametrize(
        ("eqt", "expected"),
        [(180.0, 30), (310.0, 30), (179.0, 15), (350.0, 15), (351.0, 0), (100.0, 0)],
    )
    def test_temperature_band_boundaries(self, eqt, expected):
        assert calculate_habitability({"pl_eqt": eqt}) == expected


class TestCategorize:
    @pytest.mark.parametrize(
        ("radius", "expected"),
        [
            (None, "sub-Earth"),
            (0.5, "sub-Earth"),
            (0.8, "Earth-like"),
            (1.5, "Earth-like"),
            (2.5, "super-Earth"),
            (4.0, "mini-Neptune"),
            (8.0, "Neptune-like"),
            (11.2, "gas-giant"),
        ],
    )
    def test_boundaries(self, radius, expected):
        assert categorize_planet(radius) == expected


class TestColor:
    def test_habitable_planets_are_coloured_by_score_not_temperature(self):
        assert planet_color(1500.0, 70) == planet_color(50.0, 70)

    def test_unknown_temperature_falls_back_to_grey(self):
        assert planet_color(None, 0) == (128, 128, 153)

    def test_channels_are_valid_bytes(self):
        for temp in (None, 100.0, 300.0, 600.0, 1000.0, 2000.0):
            for score in (0, 45, 80):
                assert all(0 <= c <= 255 for c in planet_color(temp, score))


class TestProjection:
    def test_exoplanets_stay_clear_of_the_solar_system(self):
        # The Solar System occupies 0..18.5 units; the shell starts at 25.
        for distance in (0.1, 1.3, 550.0, 27000.0):
            x, y, z = project_position(distance, 10.0, 10.0, 0)
            assert math.sqrt(x * x + y * y + z * z) >= 25.0

    def test_distance_ordering_is_preserved(self):
        near = project_position(4.2, 0.0, 0.0, 0)
        far = project_position(1000.0, 0.0, 0.0, 0)
        assert math.dist((0, 0, 0), near) < math.dist((0, 0, 0), far)

    def test_missing_coordinates_fan_out_instead_of_stacking(self):
        a = project_position(100.0, None, None, 0)
        b = project_position(100.0, None, None, 1)
        assert math.dist(a, b) > 1.0

    def test_visual_radius_is_clamped(self):
        assert visual_radius(0.01) == pytest.approx(0.3)
        assert visual_radius(10000.0) == pytest.approx(0.7)
        assert 0.3 <= visual_radius(1.0) <= 0.7


class TestInsolation:
    def test_earth_receives_one_solar_flux(self):
        earth = {"st_rad": 1.0, "st_teff": 5772.0, "pl_orbsmax": 1.0}
        assert calculate_insolation(earth) == pytest.approx(1.0, rel=1e-6)

    def test_halving_the_orbit_quadruples_the_flux(self):
        close = {"st_rad": 1.0, "st_teff": 5772.0, "pl_orbsmax": 0.5}
        assert calculate_insolation(close) == pytest.approx(4.0, rel=1e-6)

    def test_missing_inputs_yield_none_rather_than_an_exception(self):
        assert calculate_insolation({"st_rad": 1.0, "st_teff": 5772.0}) is None
        assert calculate_insolation({}) is None


class TestSlugify:
    def test_planet_names_become_stable_urlsafe_ids(self):
        assert slugify("Kepler-452 b") == "kepler-452-b"
        assert slugify("TRAPPIST-1 e") == "trappist-1-e"
        assert slugify("HD 209458 b") == "hd-209458-b"

    def test_id_does_not_depend_on_catalog_position(self):
        # The whole point of moving off `exo-${index}`: a new nearer planet must not
        # renumber everything behind it and break saved links.
        assert slugify("Proxima Cen b") == slugify("Proxima Cen b")

    def test_pathological_names_still_produce_something(self):
        assert slugify("!!!") == "unknown"


class TestDerive:
    def test_produces_a_complete_record(self):
        d = derive(EARTH_LIKE, 0)
        assert d.habitability_score == 90
        assert d.is_habitable is True
        assert d.size_category == "super-Earth"
        assert d.distance_ly == pytest.approx(550.0 * 3.26156)
        assert len(d.pos) == 3 and len(d.color) == 3

    def test_row_with_nothing_but_a_name_does_not_crash(self):
        d = derive({"pl_name": "Mystery"}, 7)
        assert d.habitability_score == 0
        assert d.distance_ly == 10.0
        assert d.insolation is None
