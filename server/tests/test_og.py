"""The preview card: what a share link looks like before anyone clicks it.

Everything here runs without a database and without a server. `app.og` takes a mapping
and returns a `Card`, then takes a `Card` and returns PNG bytes; `routes_share.preview_html`
takes a `Card` and returns a document. The parts that can quietly go wrong — a number
formatted as a year with a thousands separator in it, an unmeasured column presented as a
measurement, a visitor's search box landing unescaped in a meta tag — are all in that
path, so that is what is exercised.
"""

from __future__ import annotations

import struct

import pytest

from app import og
from app.routes_share import preview_html

KEPLER = {
    "id": "kepler-452-b",
    "pl_name": "Kepler-452 b",
    "hostname": "Kepler-452",
    "discoverymethod": "Transit",
    "disc_year": 2015,
    "pl_rade": 1.63,
    "pl_bmasse": 3.29,
    "pl_eqt": 265.0,
    "distance_ly": 1801.6,
    "pl_orbper": 384.843,
    "st_spectype": "G2V",
    "st_teff": 5757.0,
    "habitability_score": 82,
    "is_habitable": True,
    "color_r": 90,
    "color_g": 200,
    "color_b": 140,
}

#: A real shape from the archive: imaged companion, most columns empty.
SPARSE = {
    "id": "2mass-j2126-8140-b",
    "pl_name": "2MASS J2126-8140 b",
    "hostname": "2MASS J2126-8140",
    "discoverymethod": "Imaging",
    "disc_year": 2016,
    "pl_rade": None,
    "pl_bmasse": 4128.0,
    "pl_eqt": None,
    "distance_ly": 340.2,
    "pl_orbper": None,
    "st_spectype": None,
    "st_teff": None,
    "habitability_score": 0,
    "is_habitable": False,
    "color_r": 200,
    "color_g": 120,
    "color_b": 70,
}


def png_size(data: bytes) -> tuple[int, int]:
    """Width and height straight out of the IHDR chunk."""
    assert data[:8] == b"\x89PNG\r\n\x1a\n"
    width, height = struct.unpack(">II", data[16:24])
    return width, height


# --- ascii_text -------------------------------------------------------------------------


def test_plain_names_pass_through_unchanged():
    # Every name in the archive is already ASCII; the function must not touch them.
    for name in ("Kepler-452 b", "TRAPPIST-1 e", "2MASS J2126-8140 b", "HD 209458 b"):
        assert og.ascii_text(name) == name


def test_punctuation_is_transliterated_not_dropped():
    # "1.6 x Earth" is the sentence; "1.6  Earth" would be a bug that looks like a space.
    assert og.ascii_text("1.6 × Earth") == "1.6 x Earth"
    assert og.ascii_text("a — b") == "a - b"
    assert og.ascii_text("‘quoted’") == "'quoted'"


def test_middot_and_degree_survive_because_the_font_has_them():
    # The card leans on the middot as its separator everywhere. Dropping it turns
    # "Host Kepler-452 · Transit · 2015" into a line with two unexplained gaps.
    assert og.ascii_text("a · b") == "a · b"
    assert og.ascii_text("15°") == "15°"


def test_accents_decompose_and_unrenderable_characters_are_dropped():
    assert og.ascii_text("Brašov") == "Brasov"
    assert og.ascii_text("café") == "cafe"
    assert og.ascii_text("Trái") == "Trai"
    # Nothing the bundled face can draw, so nothing is better than a row of boxes.
    assert og.ascii_text("中文") == ""


# --- format_measure ---------------------------------------------------------------------


@pytest.mark.parametrize("missing", [None, float("nan"), float("inf"), "", "n/a", True])
def test_unmeasured_values_render_as_a_dash(missing):
    # A blank column is not a zero and must never be drawn as one.
    assert og.format_measure(missing) == "-"


def test_precision_follows_magnitude():
    assert og.format_measure(1.63) == "1.63"
    assert og.format_measure(384.843, "days") == "385 days"
    assert og.format_measure(129000.0, "days") == "129,000 days"
    assert og.format_measure(1801.6, "ly", digits=1) == "1,802 ly"


def test_trailing_zeros_are_not_false_precision():
    assert og.format_measure(1.60) == "1.6"
    assert og.format_measure(2.0) == "2"


def test_very_small_values_keep_their_order_of_magnitude():
    # Rounding 0.0031 to two decimals would print "0", which is a different claim.
    assert og.format_measure(0.0031) == "3.1e-03"


# --- planet_card ------------------------------------------------------------------------


def test_planet_card_reads_the_row():
    card = og.planet_card(KEPLER, "a1b2c3d4e5")

    assert card.title == "Kepler-452 b"
    assert card.subtitle == "Host Kepler-452 · Transit · 2015"
    assert card.planet == (90, 200, 140)
    assert card.habitability == 82
    assert card.habitable is True
    assert card.slug == "a1b2c3d4e5"

    values = {stat.label: stat.value for stat in card.stats}
    assert values["EARTH RADII"] == "1.63"
    assert values["DISTANCE"] == "1,802 ly"
    assert values["HOST STAR"] == "G2V · 5,757 K"


def test_sparse_rows_say_so_rather_than_inventing_numbers():
    card = og.planet_card(SPARSE, "q4w7e9r2t5")
    values = {stat.label: stat.value for stat in card.stats}

    assert values["EARTH RADII"] == "-"
    assert values["EQUILIBRIUM TEMP"] == "-"
    assert values["ORBITAL PERIOD"] == "-"
    assert values["HOST STAR"] == "-"
    # The blurb only claims what was measured.
    assert "x Earth radius" not in card.description
    assert "340 light years away" in card.description


def test_the_stat_order_is_the_detail_panel_order():
    # Somebody who follows the link should recognise what the card promised them.
    labels = [stat.label for stat in og.planet_card(KEPLER).stats]
    assert labels == [
        "EARTH RADII",
        "EARTH MASSES",
        "EQUILIBRIUM TEMP",
        "DISTANCE",
        "ORBITAL PERIOD",
        "HOST STAR",
    ]


def test_a_row_with_nothing_in_it_still_produces_a_card():
    card = og.planet_card({"id": "x"})
    assert card.title == "x"
    assert card.subtitle == "NASA Exoplanet Archive"
    assert card.planet == (0, 0, 0)


# --- describe_filters -------------------------------------------------------------------


def test_only_the_filters_present_are_described():
    # `app.share` stores only what the sharer changed, so the chips are a list of
    # choices — never a recital of defaults somebody left alone.
    assert og.describe_filters({}) == ()
    assert og.describe_filters({"showHabitableOnly": True}) == ("Potentially habitable only",)
    # Stored as False by nobody, but a stored False is still not a choice worth a chip.
    assert og.describe_filters({"showHabitableOnly": False}) == ()


def test_years_are_not_formatted_as_quantities():
    # "Discovered 2,009-2,018" is not a range of years anybody writes.
    assert og.describe_filters({"yearRange": [2009, 2018]}) == ("Discovered 2009-2018",)


def test_ranges_carry_their_units():
    chips = og.describe_filters({"radiusRange": [0.5, 2.4], "tempRange": [180, 310]})
    assert chips == ("Radius 0.5-2.4 x Earth", "Temp 180-310 K")


def test_long_lists_are_summarised_rather_than_truncated_silently():
    chips = og.describe_filters({"discoveryMethods": ["Transit", "Radial Velocity", "Imaging", "Microlensing"]})
    assert chips == ("Method: Transit, Radial Velocity, Imaging +1",)


def test_chip_order_is_fixed_not_dictionary_order():
    # The same link has to read the same way twice, whatever order the keys arrived in.
    first = og.describe_filters({"yearRange": [2009, 2018], "showHabitableOnly": True})
    second = og.describe_filters({"showHabitableOnly": True, "yearRange": [2009, 2018]})
    assert first == second == ("Potentially habitable only", "Discovered 2009-2018")


def test_malformed_ranges_are_skipped_not_crashed_on():
    # The state is validated on the way in, but this renders whatever is already stored.
    assert og.describe_filters({"radiusRange": [1.0]}) == ()
    assert og.describe_filters({"radiusRange": "wide"}) == ()


# --- view_card --------------------------------------------------------------------------


def test_view_card_states_the_catalog_size_it_actually_has():
    card = og.view_card({}, 6287, "zzq7m2k4p0")
    assert card.title == "The Exoplanet Map"
    assert "6,287 worlds" in card.subtitle
    assert card.planet is None
    assert card.chips == ()


def test_view_card_never_claims_a_match_count():
    # Which planets a filter set matches is decided by `applyFilters` in the browser.
    # Reproducing that rule here to print a number would be a third copy of it.
    card = og.view_card({"filters": {"showHabitableOnly": True}}, 6287)
    assert "matching" not in card.description.lower()
    assert card.chips == ("Potentially habitable only",)


def test_timeline_and_table_view_become_chips():
    card = og.view_card({"timelineYear": 2016, "view": "table"}, 6287)
    assert card.chips == ("Sky as of 2016", "Data table")


# --- render -----------------------------------------------------------------------------


def test_a_card_renders_at_the_open_graph_size():
    data = og.render(og.planet_card(KEPLER, "a1b2c3d4e5"))
    assert png_size(data) == (og.CARD_WIDTH, og.CARD_HEIGHT)
    assert og.CARD_WIDTH / og.CARD_HEIGHT == pytest.approx(1.905, abs=0.01)


def test_rendering_is_deterministic():
    # Not for secrecy — for caching. A starfield that moved between requests would give
    # the card a new ETag every time and nothing could ever store it.
    card = og.planet_card(KEPLER, "a1b2c3d4e5")
    assert og.render(card) == og.render(card)


def test_different_links_get_different_skies():
    first = og.render(og.planet_card(KEPLER, "a1b2c3d4e5"))
    second = og.render(og.planet_card(KEPLER, "zzq7m2k4p0"))
    assert first != second


def test_a_map_card_renders_without_a_planet():
    state = {"filters": {"showHabitableOnly": True, "radiusRange": [0.5, 2.4]}}
    data = og.render(og.view_card(state, 6287, "zzq7m2k4p0"))
    assert png_size(data) == (og.CARD_WIDTH, og.CARD_HEIGHT)


def test_an_overlong_name_does_not_overrun_the_card():
    row = dict(KEPLER, pl_name="A" * 200)
    assert png_size(og.render(og.planet_card(row, "a1b2c3d4e5"))) == (og.CARD_WIDTH, og.CARD_HEIGHT)


def test_a_score_outside_the_scale_does_not_draw_outside_the_bar():
    # The column is a SMALLINT; a bad ingest could put anything in it.
    for score in (-40, 250):
        row = dict(KEPLER, habitability_score=score)
        assert png_size(og.render(og.planet_card(row, "a1b2c3d4e5"))) == (og.CARD_WIDTH, og.CARD_HEIGHT)


# --- preview_html -----------------------------------------------------------------------


def _html_for(card: og.Card) -> str:
    return preview_html(
        card,
        page_url="https://example.test/s/a1b2c3d4e5",
        image_url="https://example.test/s/a1b2c3d4e5/card.png",
        target="/?v=a1b2c3d4e5",
    )


def test_the_preview_page_carries_the_tags_a_crawler_reads():
    body = _html_for(og.planet_card(KEPLER, "a1b2c3d4e5"))

    assert 'property="og:title" content="Kepler-452 b' in body
    assert 'content="https://example.test/s/a1b2c3d4e5/card.png"' in body
    assert 'name="twitter:card" content="summary_large_image"' in body
    assert f'property="og:image:width" content="{og.CARD_WIDTH}"' in body


def test_the_page_bounces_a_browser_to_the_map():
    body = _html_for(og.planet_card(KEPLER, "a1b2c3d4e5"))
    # Both, because one covers a visitor with JavaScript off and the other keeps the hop
    # out of their back-button history.
    assert 'http-equiv="refresh" content="0; url=/?v=a1b2c3d4e5"' in body
    assert 'location.replace("/?v=a1b2c3d4e5")' in body


def test_a_shared_search_box_cannot_write_html():
    # The one field on this page that is genuinely visitor-supplied: a shared view can
    # carry the search box, and it reaches og:description and the visible caption.
    card = og.view_card({"filters": {"searchQuery": '"><script>alert(1)</script>'}}, 6287)
    body = _html_for(card)

    assert "<script>alert(1)" not in body
    assert "&lt;script&gt;" in body
    # The one script element on the page is ours, and it holds only the bounce.
    assert body.count("<script>") == 1
