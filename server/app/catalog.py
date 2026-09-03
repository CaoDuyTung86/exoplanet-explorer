"""Binary catalog encoding.

The browser used to download the catalog as JSON: every number spelled out in decimal
digits, every field name repeated ~5,700 times, then parsed into ~5,700 JavaScript
objects that the GPU cannot use directly anyway.

What the renderer actually wants is typed arrays it can hand straight to an
``InstancedMesh``. So the API serves exactly that: a single ``ArrayBuffer`` of tightly
packed columns, which the client wraps in ``Float32Array``/``Uint8Array`` views with zero
parsing and zero per-planet object allocation.

Layout (little-endian throughout)::

    offset  size          field
    ------  ------------  --------------------------------------------------
    0       4             magic "EXO1"
    4       u32           format version
    8       u32           planet count (n)
    12      u32           ingest run id this payload was built from
    16      u32           number of float columns (see FLOAT_COLUMNS)
    20..52  u32 x 8       byte offset of each section
    52      u32           reserved
    56      f32 x 3n      positions   (x, y, z)
    ...     f32 x n       visual radius
    ...     f32 x n*cols  numeric columns, column-major, NaN where NASA has no value
    ...     u16 x n       discovery year (0 = unknown)
    ...     u8  x 3n      instance colour (r, g, b)
    ...     u8  x n       habitability score, 0-100
    ...     u8  x n       flags: bit0 habitable, bit1 solar system
    ...     u8  x n       size category, index into SIZE_CATEGORIES

Section offsets are written into the header rather than recomputed by the client, so the
layout can gain a column later without the decoder guessing.
"""

from __future__ import annotations

import hashlib
import struct
from typing import Any

import numpy as np

FORMAT_VERSION = 1
HEADER_SIZE = 56
MAGIC = b"EXO1"

# Numeric columns the client filters and displays on. Kept as float32 with NaN standing
# in for NULL, which is what the archive is full of.
FLOAT_COLUMNS = (
    "distance_ly",
    "pl_rade",
    "pl_bmasse",
    "pl_eqt",
    "pl_orbper",
    "pl_orbsmax",
    "st_teff",
    "st_rad",
    "insolation",
)

# Index order must stay in sync with the client decoder.
SIZE_CATEGORIES = (
    "sub-Earth",
    "Earth-like",
    "super-Earth",
    "mini-Neptune",
    "Neptune-like",
    "gas-giant",
    "Star",
)

_SIZE_INDEX = {name: i for i, name in enumerate(SIZE_CATEGORIES)}

CATALOG_SQL = f"""
SELECT id, pl_name, hostname, discoverymethod, disc_telescope, st_spectype,
       disc_year, habitability_score, is_habitable, is_solar_system, size_category,
       pos_x, pos_y, pos_z, color_r, color_g, color_b, visual_radius,
       {', '.join(FLOAT_COLUMNS)}
  FROM planets
 ORDER BY is_solar_system DESC, distance_ly ASC, id ASC
"""


def _align4(value: int) -> int:
    return (value + 3) & ~3


def encode(rows: list[Any], run_id: int) -> bytes:
    """Pack catalog rows into the binary payload described above."""
    n = len(rows)

    off_pos = HEADER_SIZE
    off_radii = off_pos + n * 3 * 4
    off_floats = off_radii + n * 4
    off_year = off_floats + n * len(FLOAT_COLUMNS) * 4
    off_color = _align4(off_year + n * 2)
    off_hab = off_color + n * 3
    off_flags = off_hab + n
    off_size = off_flags + n
    total = off_size + n

    buf = bytearray(total)

    struct.pack_into(
        "<4sIIII8I I", buf, 0,
        MAGIC, FORMAT_VERSION, n, run_id, len(FLOAT_COLUMNS),
        off_pos, off_radii, off_floats, off_year, off_color, off_hab, off_flags, off_size,
        0,
    )

    positions = np.empty(n * 3, dtype="<f4")
    radii = np.empty(n, dtype="<f4")
    floats = np.empty((len(FLOAT_COLUMNS), n), dtype="<f4")
    years = np.zeros(n, dtype="<u2")
    colors = np.empty(n * 3, dtype=np.uint8)
    habitability = np.empty(n, dtype=np.uint8)
    flags = np.zeros(n, dtype=np.uint8)
    sizes = np.zeros(n, dtype=np.uint8)

    for i, row in enumerate(rows):
        positions[i * 3] = row["pos_x"]
        positions[i * 3 + 1] = row["pos_y"]
        positions[i * 3 + 2] = row["pos_z"]
        radii[i] = row["visual_radius"]

        for c, column in enumerate(FLOAT_COLUMNS):
            value = row[column]
            floats[c, i] = np.nan if value is None else value

        year = row["disc_year"]
        # u16 holds 0-65535; the archive's years are all comfortably inside that.
        years[i] = year if year and 0 < year <= 65535 else 0

        colors[i * 3] = row["color_r"]
        colors[i * 3 + 1] = row["color_g"]
        colors[i * 3 + 2] = row["color_b"]

        habitability[i] = row["habitability_score"]
        flags[i] = (1 if row["is_habitable"] else 0) | (2 if row["is_solar_system"] else 0)
        sizes[i] = _SIZE_INDEX.get(row["size_category"], 0)

    buf[off_pos:off_radii] = positions.tobytes()
    buf[off_radii:off_floats] = radii.tobytes()
    buf[off_floats:off_floats + floats.nbytes] = floats.tobytes()
    buf[off_year:off_year + years.nbytes] = years.tobytes()
    buf[off_color:off_hab] = colors.tobytes()
    buf[off_hab:off_flags] = habitability.tobytes()
    buf[off_flags:off_size] = flags.tobytes()
    buf[off_size:total] = sizes.tobytes()

    return bytes(buf)


def build_metadata(rows: list[Any], run_id: int) -> dict[str, Any]:
    """The string half of the catalog, served separately.

    Text is what the 3D view needs *last* — a name is only read on hover or in the table,
    long after the first frame is on screen. Splitting it out lets the map start drawing
    from the binary alone.

    Repeated strings (discovery method, telescope, spectral type) are dictionary-encoded:
    ~5,700 rows share on the order of ten discovery methods, so storing an index per row
    plus one table is far smaller than repeating the words.
    """

    def dictionary_encode(field: str) -> tuple[list[str], list[int]]:
        table: list[str] = []
        index: dict[str, int] = {}
        codes: list[int] = []
        for row in rows:
            value = row[field] or ""
            code = index.get(value)
            if code is None:
                code = len(table)
                index[value] = code
                table.append(value)
            codes.append(code)
        return table, codes

    method_table, methods = dictionary_encode("discoverymethod")
    telescope_table, telescopes = dictionary_encode("disc_telescope")
    spectype_table, spectypes = dictionary_encode("st_spectype")

    return {
        "version": FORMAT_VERSION,
        "runId": run_id,
        "count": len(rows),
        "sizeCategories": list(SIZE_CATEGORIES),
        "floatColumns": list(FLOAT_COLUMNS),
        "ids": [row["id"] for row in rows],
        "names": [row["pl_name"] for row in rows],
        "hostnames": [row["hostname"] for row in rows],
        "methodTable": method_table,
        "methods": methods,
        "telescopeTable": telescope_table,
        "telescopes": telescopes,
        "spectypeTable": spectype_table,
        "spectypes": spectypes,
    }


def etag(payload: bytes) -> str:
    """Strong ETag over the exact bytes served."""
    return f'"{hashlib.sha256(payload).hexdigest()[:32]}"'
