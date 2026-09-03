"""Domain logic: turn a raw NASA archive row into the shape the 3D map needs.

This is a port of ``processExoplanets`` from ``src/features/explorer/services/nasaApi.ts``.
It used to run in a Web Worker in every visitor's browser on every page load; it now runs
once per ingest, on the server.

The scoring and projection formulas are kept **bit-for-bit identical** to the TypeScript
version on purpose, so moving the computation to the server does not silently change what
the map looks like. Improving the habitability model is deliberately a separate step
(Phase 5) so the two changes never get tangled up in one diff.
"""

from __future__ import annotations

import math
import re
import unicodedata
from dataclasses import dataclass
from typing import Any

PARSEC_IN_LIGHT_YEARS = 3.26156

# Solar effective temperature (K), used to normalise stellar luminosity.
SOLAR_TEFF = 5772.0


@dataclass(slots=True)
class Derived:
    """Everything the ingest computes on top of NASA's raw columns."""

    distance_ly: float
    insolation: float | None
    habitability_score: int
    is_habitable: bool
    size_category: str
    pos: tuple[float, float, float]
    color: tuple[int, int, int]
    visual_radius: float


def slugify(name: str) -> str:
    """Stable id derived from the planet name.

    The TypeScript version used ``exo-${index}``, an id that shifts for every planet
    whenever NASA adds a new one nearer to Earth — which would break saved links and
    bookmarks the moment Phase 3 ships. Names in ``pscomppars`` are unique and stable,
    so they make a much better key.
    """
    normalised = unicodedata.normalize("NFKD", name).encode("ascii", "ignore").decode()
    slug = re.sub(r"[^a-z0-9]+", "-", normalised.lower()).strip("-")
    return slug or "unknown"


def parsecs_to_light_years(pc: float) -> float:
    return pc * PARSEC_IN_LIGHT_YEARS


def calculate_habitability(row: dict[str, Any]) -> int:
    """0-100 heuristic. Ported verbatim from ``calculateHabitability``."""
    score = 0

    eqt = row.get("pl_eqt")
    if eqt is not None:
        if 180 <= eqt <= 310:
            score += 30
        elif 150 <= eqt <= 350:
            score += 15

    rade = row.get("pl_rade")
    if rade is not None:
        if 0.8 <= rade <= 1.5:
            score += 25
        elif 0.5 <= rade <= 2.0:
            score += 15
        elif 2.0 <= rade <= 4.0:
            score += 5

    masse = row.get("pl_bmasse")
    if masse is not None:
        if 0.5 <= masse <= 5.0:
            score += 25
        elif 0.1 <= masse <= 10.0:
            score += 12

    spectype = row.get("st_spectype")
    teff = row.get("st_teff")
    if spectype:
        star_class = spectype[0].upper()
        score += {"G": 20, "K": 18, "F": 10, "M": 8}.get(star_class, 0)
    elif teff is not None:
        if 4500 <= teff <= 6500:
            score += 15
        elif 3500 <= teff <= 7500:
            score += 8

    return min(100, score)


def categorize_planet(radius_earth: float | None) -> str:
    if radius_earth is None or radius_earth < 0.8:
        return "sub-Earth"
    if radius_earth <= 1.5:
        return "Earth-like"
    if radius_earth <= 2.5:
        return "super-Earth"
    if radius_earth <= 4.0:
        return "mini-Neptune"
    if radius_earth <= 8.0:
        return "Neptune-like"
    return "gas-giant"


def planet_color(temp: float | None, habit_score: int) -> tuple[int, int, int]:
    """Instance colour as 0-255 RGB.

    The TypeScript version carried these as three float32 values per planet. Storing
    them as bytes cuts that part of the payload by 4x with no visible difference —
    the shader divides by 255 on the way in.
    """
    if habit_score >= 60:
        rgb = (0.2, 0.8, 0.5)
    elif habit_score >= 40:
        rgb = (0.3, 0.7, 0.9)
    elif temp is None:
        rgb = (0.5, 0.5, 0.6)
    elif temp < 200:
        rgb = (0.4, 0.5, 0.95)
    elif temp < 400:
        rgb = (0.3, 0.75, 0.85)
    elif temp < 800:
        rgb = (0.9, 0.7, 0.3)
    elif temp < 1500:
        rgb = (0.95, 0.45, 0.2)
    else:
        rgb = (0.95, 0.2, 0.15)

    return tuple(round(c * 255) for c in rgb)  # type: ignore[return-value]


def calculate_insolation(row: dict[str, Any]) -> float | None:
    """Stellar flux at the planet, in Earth units.

    S = (R*/R_sun)^2 * (T*/T_sun)^4 / a^2

    Not used by the current habitability score, which only looks at equilibrium
    temperature. It is computed and stored now because it is the physically correct
    input for the Phase 5 rework, and because a planet's insolation is what actually
    places it inside or outside the habitable zone.
    """
    st_rad = row.get("st_rad")
    st_teff = row.get("st_teff")
    orbsmax = row.get("pl_orbsmax")
    if not st_rad or not st_teff or not orbsmax:
        return None
    try:
        luminosity = (st_rad**2) * ((st_teff / SOLAR_TEFF) ** 4)
        return luminosity / (orbsmax**2)
    except (ZeroDivisionError, OverflowError):
        return None


def project_position(
    distance_ly: float, ra: float | None, dec: float | None, index: int
) -> tuple[float, float, float]:
    """Right ascension / declination / distance -> scene coordinates.

    Distance is compressed by a power of 0.42 and offset by 25 units so that the
    exoplanets occupy a shell from ~25 to ~350 units, leaving the Solar System (0 to
    18.5 units) clear at the centre.

    ``index`` only matters for rows where NASA has no sky coordinates; it fans those
    out instead of stacking them all on one axis. Rows are ingested ordered by
    distance, so the fallback is deterministic across runs.
    """
    ra_rad = math.radians(ra if ra is not None else index * 20)
    dec_rad = math.radians(dec if dec is not None else (index % 5) * 15 - 30)

    dist_scaled = math.pow(max(0.1, distance_ly), 0.42) * 9 + 25.0

    return (
        dist_scaled * math.cos(dec_rad) * math.cos(ra_rad),
        dist_scaled * math.sin(dec_rad),
        dist_scaled * math.cos(dec_rad) * math.sin(ra_rad),
    )


def visual_radius(radius_earth: float | None) -> float:
    base = radius_earth if radius_earth is not None else 1.0
    return max(0.3, min(0.7, math.log2(base + 1) * 0.2))


def derive(row: dict[str, Any], index: int) -> Derived:
    """Compute every derived field for one raw NASA row."""
    sy_dist = row.get("sy_dist")
    distance_ly = parsecs_to_light_years(sy_dist) if sy_dist else 10.0

    score = calculate_habitability(row)

    return Derived(
        distance_ly=distance_ly,
        insolation=calculate_insolation(row),
        habitability_score=score,
        is_habitable=score >= 40,
        size_category=categorize_planet(row.get("pl_rade")),
        pos=project_position(distance_ly, row.get("ra"), row.get("dec"), index),
        color=planet_color(row.get("pl_eqt"), score),
        visual_radius=visual_radius(row.get("pl_rade")),
    )
