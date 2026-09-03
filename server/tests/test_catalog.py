"""Tests for the binary catalog format.

The encoder and the TypeScript decoder are two halves of one wire format with no shared
type to keep them honest, so these tests pin the layout down: the header, every section
offset, and the values that come back out of each one.
"""

from __future__ import annotations

import struct

import numpy as np
import pytest

from app import catalog


def make_row(**overrides):
    row = {
        "id": "kepler-452-b",
        "pl_name": "Kepler-452 b",
        "hostname": "Kepler-452",
        "discoverymethod": "Transit",
        "disc_telescope": "Kepler Space Telescope",
        "st_spectype": "G2V",
        "disc_year": 2015,
        "habitability_score": 90,
        "is_habitable": True,
        "is_solar_system": False,
        "size_category": "super-Earth",
        "pos_x": 1.5, "pos_y": -2.5, "pos_z": 3.5,
        "color_r": 51, "color_g": 178, "color_b": 229,
        "visual_radius": 0.42,
        "distance_ly": 1793.9, "pl_rade": 1.63, "pl_bmasse": 5.0, "pl_eqt": 265.0,
        "pl_orbper": 384.84, "pl_orbsmax": 1.046, "st_teff": 5757.0, "st_rad": 1.11,
        "insolation": 1.1,
    }
    row.update(overrides)
    return row


def header(payload: bytes):
    fields = struct.unpack_from("<4sIIII8I I", payload, 0)
    return {
        "magic": fields[0], "version": fields[1], "count": fields[2], "run_id": fields[3],
        "n_float_cols": fields[4],
        "off_pos": fields[5], "off_radii": fields[6], "off_floats": fields[7],
        "off_year": fields[8], "off_color": fields[9], "off_hab": fields[10],
        "off_flags": fields[11], "off_size": fields[12],
    }


class TestHeader:
    def test_magic_and_version(self):
        h = header(catalog.encode([make_row()], run_id=7))
        assert h["magic"] == b"EXO1"
        assert h["version"] == catalog.FORMAT_VERSION
        assert h["count"] == 1
        assert h["run_id"] == 7

    def test_header_is_the_declared_size(self):
        assert struct.calcsize("<4sIIII8I I") == catalog.HEADER_SIZE

    def test_float_sections_are_four_byte_aligned(self):
        # Float32Array cannot be created over an unaligned offset in JavaScript.
        for count in (1, 2, 3, 17, 5713):  # odd counts are the ones that bite
            h = header(catalog.encode([make_row() for _ in range(count)], run_id=1))
            for key in ("off_pos", "off_radii", "off_floats", "off_year", "off_color"):
                assert h[key] % 4 == 0, f"{key} unaligned at count={count}"

    def test_payload_length_matches_the_layout(self):
        count = 100
        payload = catalog.encode([make_row() for _ in range(count)], run_id=1)
        h = header(payload)
        assert len(payload) == h["off_size"] + count


class TestSections:
    def test_positions_round_trip(self):
        payload = catalog.encode([make_row()], run_id=1)
        h = header(payload)
        pos = np.frombuffer(payload, dtype="<f4", count=3, offset=h["off_pos"])
        assert pos.tolist() == pytest.approx([1.5, -2.5, 3.5])

    def test_numeric_columns_are_column_major(self):
        rows = [make_row(pl_eqt=100.0), make_row(pl_eqt=200.0), make_row(pl_eqt=300.0)]
        payload = catalog.encode(rows, run_id=1)
        h = header(payload)
        col = catalog.FLOAT_COLUMNS.index("pl_eqt")
        values = np.frombuffer(
            payload, dtype="<f4", count=3, offset=h["off_floats"] + col * 3 * 4
        )
        assert values.tolist() == pytest.approx([100.0, 200.0, 300.0])

    def test_null_numbers_become_nan(self):
        payload = catalog.encode([make_row(pl_bmasse=None)], run_id=1)
        h = header(payload)
        col = catalog.FLOAT_COLUMNS.index("pl_bmasse")
        value = np.frombuffer(payload, dtype="<f4", count=1, offset=h["off_floats"] + col * 4)
        assert np.isnan(value[0])

    def test_colors_and_score(self):
        payload = catalog.encode([make_row()], run_id=1)
        h = header(payload)
        assert list(payload[h["off_color"]:h["off_color"] + 3]) == [51, 178, 229]
        assert payload[h["off_hab"]] == 90

    def test_flags_pack_both_booleans(self):
        rows = [
            make_row(is_habitable=False, is_solar_system=False),
            make_row(is_habitable=True, is_solar_system=False),
            make_row(is_habitable=False, is_solar_system=True),
            make_row(is_habitable=True, is_solar_system=True),
        ]
        payload = catalog.encode(rows, run_id=1)
        h = header(payload)
        assert list(payload[h["off_flags"]:h["off_flags"] + 4]) == [0, 1, 2, 3]

    def test_size_category_index_matches_the_published_table(self):
        payload = catalog.encode([make_row(size_category="gas-giant")], run_id=1)
        h = header(payload)
        assert catalog.SIZE_CATEGORIES[payload[h["off_size"]]] == "gas-giant"

    def test_unknown_year_encodes_as_zero(self):
        payload = catalog.encode([make_row(disc_year=None)], run_id=1)
        h = header(payload)
        assert struct.unpack_from("<H", payload, h["off_year"])[0] == 0

    def test_empty_catalog_produces_a_valid_header(self):
        payload = catalog.encode([], run_id=1)
        assert header(payload)["count"] == 0
        assert len(payload) == catalog.HEADER_SIZE


class TestMetadata:
    def test_repeated_strings_are_dictionary_encoded(self):
        rows = [make_row() for _ in range(50)]
        meta = catalog.build_metadata(rows, run_id=1)
        assert meta["methodTable"] == ["Transit"]
        assert meta["methods"] == [0] * 50

    def test_row_order_is_shared_with_the_binary(self):
        rows = [make_row(pl_name="A", id="a"), make_row(pl_name="B", id="b")]
        meta = catalog.build_metadata(rows, run_id=1)
        assert meta["names"] == ["A", "B"]
        assert meta["ids"] == ["a", "b"]

    def test_null_strings_become_empty_not_null(self):
        meta = catalog.build_metadata([make_row(st_spectype=None)], run_id=1)
        assert meta["spectypeTable"] == [""]


class TestEtag:
    def test_identical_payloads_share_an_etag(self):
        a = catalog.encode([make_row()], run_id=1)
        b = catalog.encode([make_row()], run_id=1)
        assert catalog.etag(a) == catalog.etag(b)

    def test_any_change_produces_a_different_etag(self):
        a = catalog.encode([make_row()], run_id=1)
        b = catalog.encode([make_row(pl_eqt=266.0)], run_id=1)
        assert catalog.etag(a) != catalog.etag(b)
