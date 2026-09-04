"""Feature vectors, so "find me another planet like this one" is one index scan.

The question the map cannot answer by itself is *which other world is this one like*.
Eyeballing it does not work: a planet is a handful of numbers spanning orders of
magnitude (0.3 to 30 Earth radii, 0.01 to 10,000 times Earth's insolation) next to one
that does not (stellar temperature, a few thousand kelvin). Compare them raw and the
temperature term is the only one that counts.

So each planet is reduced to four standardised numbers, stored as a ``cube``, and
neighbours are whatever sits closest in that space. Four choices are worth spelling out:

*Which four.* Radius, mass, insolation, host-star temperature. Between them they say how
big it is, what it is made of, how hard its star is shining on it, and what kind of star
that is. Orbital period is deliberately left out: insolation is already derived from the
orbit and the star, so including the period would count the same fact twice.

*Log first.* Radius, mass and insolation are ratios against Earth and span orders of
magnitude, so the meaningful step is multiplicative — the gap from 1 to 2 Earth radii
matters far more than the gap from 20 to 21. Taking log10 makes arithmetic distance match
that. Stellar temperature is already a narrow linear range and is left alone.

*Then standardise.* Every dimension is divided by its own spread, so one standard
deviation of radius counts the same as one standard deviation of temperature. Without it
the vector is just stellar temperature again, wearing a hat.

*Missing values sit at the mean.* The archive is genuinely incomplete — around one planet
in eight has no insolation. Imputing to the population mean is the neutral choice: it
invents neither a similarity nor a difference. But an imputed number must never be
presented as a measurement, so `feature_vector` returns a bitmask of what was really
measured, the mask is stored beside the vector, and the API reports it.

Everything here is a pure function over plain dicts, so it is tested without a database.
"""

from __future__ import annotations

import math
from dataclasses import dataclass
from typing import Any, Iterable, Sequence

from .transform import calculate_insolation


@dataclass(frozen=True, slots=True)
class Feature:
    """One dimension of the vector."""

    name: str
    #: Whether the quantity spans orders of magnitude and should be compared
    #: multiplicatively.
    log_scale: bool


# Order is part of the wire format: it fixes which bit of `feature_mask` means what and
# which position in the stored cube is which. Appending is safe, reordering is not — it
# would require a re-ingest to rebuild every vector.
FEATURES: tuple[Feature, ...] = (
    Feature("pl_rade", log_scale=True),
    Feature("pl_bmasse", log_scale=True),
    Feature("insolation", log_scale=True),
    Feature("st_teff", log_scale=False),
)

FEATURE_NAMES: tuple[str, ...] = tuple(f.name for f in FEATURES)

#: A vector built from fewer measured dimensions than this is not worth ranking: at one
#: measured dimension out of four, "nearest" means little more than "also average".
MIN_MEASURED_DIMENSIONS = 2


@dataclass(frozen=True, slots=True)
class FeatureStat:
    """Population mean and spread of one dimension, in its transformed units."""

    dimension: int
    feature: str
    mean: float
    stddev: float
    measured_count: int


def raw_value(row: dict[str, Any], feature: str) -> float | None:
    """The untransformed value of one feature, or None if the archive has no number.

    ``insolation`` is derived rather than served by NASA, and the Solar System rows are
    seeded by us with the column left empty, so it is recomputed from the star and the
    orbit when the stored value is missing. Without that fallback Earth would have no
    measured flux, and "which exoplanet is most like Earth" — the reason the Solar System
    is in the catalog at all — would be answered from an imputed number.
    """
    value = row.get(feature)
    if value is None and feature == "insolation":
        value = calculate_insolation(row)
    if value is None:
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def transform(feature: Feature, value: float | None) -> float | None:
    """Put one raw value into the space distances are measured in.

    A non-positive value on a log dimension is not a very small planet, it is a bad row:
    the archive occasionally carries a zero where it means "unknown". Treating it as
    missing beats letting log10 raise, and beats clamping it to an arbitrary floor that
    would park it at one extreme of the axis.
    """
    if value is None:
        return None
    if not feature.log_scale:
        return value
    if value <= 0:
        return None
    return math.log10(value)


def build_stats(rows: Iterable[dict[str, Any]]) -> list[FeatureStat]:
    """Mean and standard deviation of each dimension, over the rows that measured it.

    Computed per ingest rather than hard-coded: the catalog grows by hundreds of planets
    a year and its shape shifts with whichever survey is currently reporting, so a
    constant written today would slowly stop describing the population it standardises.

    A dimension with no spread (or a single measured row) gets a stddev of 1, which
    leaves its values as they are instead of dividing by zero.
    """
    columns: list[list[float]] = [[] for _ in FEATURES]

    for row in rows:
        for index, feature in enumerate(FEATURES):
            value = transform(feature, raw_value(row, feature.name))
            if value is not None:
                columns[index].append(value)

    stats: list[FeatureStat] = []
    for index, (feature, values) in enumerate(zip(FEATURES, columns)):
        count = len(values)
        if count == 0:
            stats.append(FeatureStat(index, feature.name, 0.0, 1.0, 0))
            continue

        mean = sum(values) / count
        variance = sum((v - mean) ** 2 for v in values) / count if count > 1 else 0.0
        stddev = math.sqrt(variance)
        stats.append(
            FeatureStat(index, feature.name, mean, stddev if stddev > 1e-12 else 1.0, count)
        )

    return stats


def feature_vector(
    row: dict[str, Any], stats: Sequence[FeatureStat]
) -> tuple[tuple[float, ...] | None, int]:
    """Standardised coordinates for one planet, plus a bitmask of what was measured.

    Bit *i* of the mask is set when dimension *i* came from a real number. Unmeasured
    dimensions land on 0 — the population mean — and the caller is expected to carry the
    mask forward rather than let an imputed coordinate pass for an observation.

    Returns ``(None, mask)`` when too few dimensions are measured to rank the row
    honestly; ingest stores a NULL vector for those and the index skips them.
    """
    coords: list[float] = []
    mask = 0

    for index, feature in enumerate(FEATURES):
        value = transform(feature, raw_value(row, feature.name))
        if value is None:
            coords.append(0.0)
            continue
        stat = stats[index]
        coords.append((value - stat.mean) / stat.stddev)
        mask |= 1 << index

    if bin(mask).count("1") < MIN_MEASURED_DIMENSIONS:
        return None, mask

    return tuple(coords), mask


def cube_literal(coords: Sequence[float] | None) -> str | None:
    """Format coordinates as a cube literal: ``(1.23, -0.4, 0, 0.9)``.

    Sent as text and cast in SQL. asyncpg has no codec for ``cube`` — it is a contrib
    type, not a built-in — and one ``$n::text::cube`` at two call sites is a smaller
    thing to carry than a custom codec registered on every pooled connection.
    """
    if coords is None:
        return None
    return "(" + ", ".join(f"{c:.6f}" for c in coords) + ")"


def measured_fields(mask: int) -> list[str]:
    """Names of the dimensions a mask says were really measured."""
    return [f.name for i, f in enumerate(FEATURES) if mask & (1 << i)]


def similarity_percent(distance: float) -> int:
    """A 0-100 reading of a Euclidean distance in standardised space.

    A Gaussian falloff with a bandwidth of one standard deviation: identical planets read
    100, one standard deviation apart on a single axis reads 61, two reads 14. It is a
    monotone rescaling of the distance for display — a fuller bar means a closer match,
    and nothing more. It is not a probability, and the raw distance travels alongside it
    so the ranking can always be checked against the number it came from.
    """
    if not math.isfinite(distance) or distance < 0:
        return 0
    return round(100 * math.exp(-(distance**2) / 2))


def field_ratios(subject: dict[str, Any], neighbour: dict[str, Any]) -> dict[str, float]:
    """How many times the neighbour's value is the subject's, per feature.

    "1.04x the radius, 0.8x the mass" is a comparison a reader can check; a standardised
    distance is not. Only pairs where both planets have a real, non-zero measurement are
    included — a ratio against an imputed value would be fiction.
    """
    ratios: dict[str, float] = {}
    for feature in FEATURES:
        mine = raw_value(subject, feature.name)
        theirs = raw_value(neighbour, feature.name)
        if mine is None or theirs is None or mine == 0:
            continue
        ratios[feature.name] = theirs / mine
    return ratios
