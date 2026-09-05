"""Preview cards — what a shared link looks like before anyone clicks it.

A permalink is ten characters. Pasted into a chat window that is all it is: ten
characters. This module is the other half of the link — the 1200x630 image a crawler
fetches so the same paste arrives as a *planet passport*: the world being pointed at, its
measurements, and how habitable we think it is.

Three things are worth stating outright.

**The card is drawn, not screenshotted.** Rendering the actual WebGL scene server-side
would mean a headless browser per request — several hundred megabytes of Chromium to
produce a picture of six thousand dots, most of which a 1200x630 thumbnail cannot
resolve anyway. What a preview has to answer is "which world is this, and is it worth a
click", and that is a typographic question. So the planet is a shaded sphere built from
the same catalog colour the map uses, and the rest is a data sheet.

**Text is ASCII, deliberately.** Pillow bundles one scalable face (Aileron Regular) and
its bundled subset covers basic Latin, no more: an em dash, a multiplication sign or an
Earth symbol all render as .notdef boxes. Vendoring a full font is the obvious fix and
was declined — the alternative costs one function (`ascii_text`) and pushes the units
into the *labels*, where "EARTH RADII / 1.63" reads better than "Radius / 1.63 R(+)"
would have anyway. `ascii_text` is applied to everything drawn, so a planet name arriving
with a character the face lacks degrades to a transliteration instead of a row of boxes.

**Nothing here reaches for a database.** `planet_card` and `view_card` take a mapping and
return a `Card`; `render` takes a `Card` and returns PNG bytes. The route in
`routes_share` is the only part that knows what a connection is, which is what lets the
interesting decisions — how a filter is described, how a number is rounded, whether an
unmeasured value is shown as a dash or quietly invented — be tested without one.
"""

from __future__ import annotations

import hashlib
import io
import math
import random
import unicodedata
from dataclasses import dataclass, field
from typing import Any, Mapping, Sequence

import numpy as np
from PIL import Image, ImageDraw, ImageFont

#: The size every social preview is expected in: 1.91:1, the Open Graph recommendation
#: and what Slack, Discord, X, Facebook and iMessage all crop to.
CARD_WIDTH = 1200
CARD_HEIGHT = 630

#: The background, the planet and the bars are drawn at twice the final size and shrunk.
#: Circles and gradients get their antialiasing that way; the text is drawn afterwards at
#: final size, because FreeType already antialiases and downscaling glyphs only softens
#: them.
SUPERSAMPLE = 2

# --- Palette. Lifted from the app's own dark theme so the card and the map agree. ------
_INK = (232, 238, 248)
_MUTED = (148, 163, 184)
_DIM = (100, 116, 139)
_ACCENT = (34, 211, 238)
_HABITABLE = (74, 222, 128)
_SKY_TOP = (6, 10, 22)
_SKY_BOTTOM = (12, 18, 36)

#: Characters the bundled face is missing but that turn up in astronomical prose. Mapped
#: rather than dropped: "1.6 x Earth" is the sentence, "1.6  Earth" is a bug.
_TRANSLITERATE = {
    "—": "-",  # em dash
    "–": "-",  # en dash
    "−": "-",  # minus sign
    "×": "x",  # multiplication sign
    "⊕": "E",  # Earth symbol
    "⊙": "S",  # Sun symbol
    "‘": "'",
    "’": "'",
    "“": '"',
    "”": '"',
    "…": "...",
    " ": " ",
    "→": "->",
    "•": "-",
}


#: Two characters past ASCII that the bundled face does draw, checked glyph by glyph.
#: The middot is the separator this card leans on everywhere; dropping it silently turns
#: "Host Kepler-452 · Transit · 2015" into a line with two unexplained gaps in it.
_EXTRA_GLYPHS = "·°"


def ascii_text(value: str) -> str:
    """Reduce a string to what the bundled face can actually draw.

    Accented letters decompose to their base form (NFKD, then drop the combining marks),
    known punctuation is transliterated, and anything still outside printable ASCII is
    dropped. A planet name that survives unchanged — which is all of them, NASA's names
    are ASCII — costs one pass; the point is the ones that would not.
    """
    swapped = "".join(_TRANSLITERATE.get(ch, ch) for ch in value)
    decomposed = unicodedata.normalize("NFKD", swapped)
    kept = [ch for ch in decomposed if not unicodedata.combining(ch)]
    return "".join(ch for ch in kept if 32 <= ord(ch) < 127 or ch in _EXTRA_GLYPHS)


# --- Formatting ------------------------------------------------------------------------


def _num(value: Any) -> float | None:
    """A finite number, or nothing. NULL columns and NaN both mean "not measured"."""
    if value is None or isinstance(value, bool):
        return None
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if math.isfinite(number) else None


def format_measure(value: Any, unit: str = "", digits: int = 2) -> str:
    """A measurement, or a dash.

    Significant digits rather than a fixed count: a radius of 1.63 and an orbital period
    of 129,000 days are both readable, which `f"{v:.2f}"` does not manage for the second.
    An absent value renders as "-" — the one honest thing to draw for a column the
    archive never filled in.
    """
    number = _num(value)
    if number is None:
        return "-"

    magnitude = abs(number)
    if magnitude >= 1000:
        text = f"{number:,.0f}"
    elif magnitude >= 100:
        text = f"{number:,.{max(0, digits - 2)}f}"
    elif magnitude >= 10:
        text = f"{number:,.{max(0, digits - 1)}f}"
    elif magnitude >= 0.01 or magnitude == 0:
        text = f"{number:,.{digits}f}"
    else:
        text = f"{number:.1e}"

    # 1.60 is a measurement to two decimals; 1.6 is the same number without the false
    # precision, and the card has no room for either kind of noise.
    if "." in text and "e" not in text:
        text = text.rstrip("0").rstrip(".")
    return f"{text} {unit}".strip() if unit else text


# --- The card model --------------------------------------------------------------------


@dataclass(frozen=True)
class Stat:
    label: str
    value: str


@dataclass(frozen=True)
class Card:
    """Everything the renderer needs, and nothing about how it is drawn.

    `planet` is the disc's colour when the card is about one world and ``None`` when the
    link is a view of the whole map — the two are drawn differently, but that is the
    renderer's business, not the builder's.
    """

    title: str
    subtitle: str
    eyebrow: str = "SHARED VIEW"
    stats: tuple[Stat, ...] = ()
    chips: tuple[str, ...] = ()
    planet: tuple[int, int, int] | None = None
    habitability: int | None = None
    habitable: bool = False
    footer: str = "EXOPLANET EXPLORER"

    #: The link this card belongs to. Printed in the corner, and it seeds the starfield
    #: so one link always renders the same sky — the point being a stable ETag, not
    #: secrecy. Empty for a card rendered outside a link (a test, a preview of the
    #: layout), which falls back to seeding on the title.
    slug: str = ""

    #: The one-line summary a crawler shows under the title. Derived here rather than in
    #: the route so the words and the picture cannot disagree about what the link is.
    description: str = field(default="")


def _spectral_summary(row: Mapping[str, Any]) -> str:
    spectype = ascii_text(str(row.get("st_spectype") or "")).strip()
    teff = _num(row.get("st_teff"))
    if spectype and teff:
        return f"{spectype} · {teff:,.0f} K"
    if spectype:
        return spectype
    if teff:
        return f"{teff:,.0f} K"
    return "-"


def planet_card(row: Mapping[str, Any], slug: str = "") -> Card:
    """A passport for one world.

    The six statistics are the ones the detail panel leads with, in the order it uses
    them, so somebody who follows the link recognises what they were promised.
    Habitability is its own row rather than a seventh statistic because it is the only
    number on the card that is *ours* — the rest are NASA's, and that split should be
    visible.
    """
    name = ascii_text(str(row.get("pl_name") or row.get("id") or "Unknown world"))
    host = ascii_text(str(row.get("hostname") or "")).strip()
    method = ascii_text(str(row.get("discoverymethod") or "")).strip()
    year = row.get("disc_year")

    parts = [p for p in (f"Host {host}" if host else "", method, str(year) if year else "") if p]
    subtitle = " · ".join(parts) if parts else "NASA Exoplanet Archive"

    score = row.get("habitability_score")
    score_int = (
        int(score) if isinstance(score, (int, float)) and not isinstance(score, bool) else None
    )

    stats = (
        Stat("EARTH RADII", format_measure(row.get("pl_rade"))),
        Stat("EARTH MASSES", format_measure(row.get("pl_bmasse"))),
        Stat("EQUILIBRIUM TEMP", format_measure(row.get("pl_eqt"), "K", digits=0)),
        Stat("DISTANCE", format_measure(row.get("distance_ly"), "ly", digits=1)),
        Stat("ORBITAL PERIOD", format_measure(row.get("pl_orbper"), "days")),
        Stat("HOST STAR", _spectral_summary(row)),
    )

    blurb = [name]
    distance = _num(row.get("distance_ly"))
    if distance is not None:
        blurb.append(f"{distance:,.0f} light years away")
    radius = _num(row.get("pl_rade"))
    if radius is not None:
        blurb.append(f"{format_measure(radius)} x Earth radius")
    if score_int is not None:
        blurb.append(f"habitability {score_int}/100")

    colour = (
        int(row.get("color_r") or 0),
        int(row.get("color_g") or 0),
        int(row.get("color_b") or 0),
    )

    return Card(
        title=name,
        subtitle=subtitle,
        stats=stats,
        planet=colour,
        habitability=score_int,
        habitable=bool(row.get("is_habitable")),
        slug=slug,
        description=" · ".join(blurb) + ". Shared from Exoplanet Explorer.",
    )


#: How a stored filter is worded on the card. This is the order the chips appear in, and
#: it is the sidebar's order rather than the dict's — the same link should read the same
#: way twice.
_CHIP_ORDER = (
    "showHabitableOnly",
    "searchQuery",
    "radiusRange",
    "massRange",
    "tempRange",
    "distanceRange",
    "orbitalPeriodRange",
    "yearRange",
    "discoveryMethods",
    "spectralTypes",
)

_RANGE_CHIPS = {
    "radiusRange": ("Radius", "x Earth"),
    "massRange": ("Mass", "x Earth"),
    "tempRange": ("Temp", "K"),
    "distanceRange": ("Distance", "ly"),
    "orbitalPeriodRange": ("Period", "days"),
    "yearRange": ("Discovered", ""),
}


def describe_filters(filters: Mapping[str, Any]) -> tuple[str, ...]:
    """The stored filters as short phrases.

    Only the filters actually present are described, which is exactly the ones the sharer
    changed — `app.share` drops the rest before storing. So the chips are a list of what
    somebody chose, never a recital of the defaults they left alone.
    """
    chips: list[str] = []
    for key in _CHIP_ORDER:
        if key not in filters:
            continue
        value = filters[key]

        if key == "showHabitableOnly":
            if value:
                chips.append("Potentially habitable only")
        elif key == "searchQuery":
            text = ascii_text(str(value)).strip()
            if text:
                chips.append(f'Matching "{text}"')
        elif key in _RANGE_CHIPS:
            if not isinstance(value, (list, tuple)) or len(value) != 2:
                continue
            label, unit = _RANGE_CHIPS[key]
            if key == "yearRange":
                # A year is a name, not a quantity: "2,009" is not a year anybody writes.
                low, high = f"{int(value[0])}", f"{int(value[1])}"
            else:
                low, high = format_measure(value[0]), format_measure(value[1])
            chips.append(f"{label} {low}-{high} {unit}".strip())
        elif isinstance(value, (list, tuple)) and value:
            items = [ascii_text(str(v)) for v in value]
            noun = "Method" if key == "discoveryMethods" else "Star class"
            shown = ", ".join(items[:3])
            if len(items) > 3:
                shown += f" +{len(items) - 3}"
            chips.append(f"{noun}: {shown}")

    return tuple(chips)


def view_card(state: Mapping[str, Any], catalog_size: int, slug: str = "") -> Card:
    """A link that pins a view of the whole map rather than one world.

    No planet count is printed, on purpose. Which planets a filter set matches is decided
    by `applyFilters` in the browser, and reproducing that rule in SQL to put a number on
    a picture would be a third copy of it — the kind that drifts quietly and lies
    confidently. The chips say what was asked for; the catalog size is a fact this service
    actually holds.
    """
    chips = describe_filters(state.get("filters") or {})
    year = state.get("timelineYear")
    if isinstance(year, int) and not isinstance(year, bool):
        chips = chips + (f"Sky as of {year}",)
    if state.get("view") == "table":
        chips = chips + ("Data table",)

    subtitle = f"{catalog_size:,} worlds from the NASA Exoplanet Archive"
    if chips:
        description = "A filtered view: " + "; ".join(chips) + "."
    else:
        description = f"The full map of {catalog_size:,} known worlds."

    return Card(
        title="The Exoplanet Map",
        subtitle=subtitle,
        chips=chips,
        slug=slug,
        description=description + " Shared from Exoplanet Explorer.",
    )


# --- Rendering -------------------------------------------------------------------------


def _font(size: int) -> ImageFont.FreeTypeFont:
    # Pillow >= 10.1 returns a scalable face here; every size below assumes it.
    return ImageFont.load_default(size=size)


def _rng(seed: str) -> random.Random:
    """Deterministic per link: the same slug must always produce the same bytes.

    Not for secrecy — for caching. A card whose starfield moved on every request would
    have a different ETag every time and could never be stored by anything.
    """
    digest = hashlib.sha256(seed.encode("utf-8")).digest()
    return random.Random(int.from_bytes(digest[:8], "big"))


def _sky(width: int, height: int) -> np.ndarray:
    """Vertical gradient, as float RGB in 0..1."""
    ramp = np.linspace(0.0, 1.0, height, dtype=np.float32)[:, None]
    top = np.array(_SKY_TOP, dtype=np.float32) / 255.0
    bottom = np.array(_SKY_BOTTOM, dtype=np.float32) / 255.0
    column = (top + (bottom - top) * ramp)[:, None, :]
    return np.repeat(column, width, axis=1)


def _add_glow(
    canvas: np.ndarray,
    cx: float,
    cy: float,
    radius: float,
    colour: Sequence[float],
    strength: float,
) -> None:
    """A soft radial wash, added rather than blended so it reads as light, not paint."""
    height, width, _ = canvas.shape
    y0, y1 = max(0, int(cy - radius)), min(height, int(cy + radius) + 1)
    x0, x1 = max(0, int(cx - radius)), min(width, int(cx + radius) + 1)
    if y0 >= y1 or x0 >= x1:
        return

    yy = np.arange(y0, y1, dtype=np.float32)[:, None] - cy
    xx = np.arange(x0, x1, dtype=np.float32)[None, :] - cx
    falloff = np.clip(1.0 - np.sqrt(yy * yy + xx * xx) / radius, 0.0, 1.0) ** 2.5
    tint = np.asarray(colour, dtype=np.float32)
    canvas[y0:y1, x0:x1] += falloff[:, :, None] * tint[None, None, :] * strength


def _add_stars(canvas: np.ndarray, rng: random.Random, count: int) -> None:
    """Background stars.

    Drawn straight into the supersampled buffer as one or two pixels rather than as
    circles: at final size those become the sub-pixel points a real sky is made of, and
    anything larger starts to look like snow.
    """
    height, width, _ = canvas.shape
    for _ in range(count):
        x = rng.randrange(width - 2)
        y = rng.randrange(height - 2)
        brightness = rng.uniform(0.12, 0.9) ** 1.6
        size = 1 if brightness < 0.55 else 2
        # A faint blue-white spread, so the field is not a grid of identical grey dots.
        tint = np.array(
            (0.82 + rng.uniform(0, 0.18), 0.88 + rng.uniform(0, 0.12), 1.0), dtype=np.float32
        )
        canvas[y : y + size, x : x + size] += tint * brightness


def _draw_planet(
    canvas: np.ndarray,
    cx: float,
    cy: float,
    radius: float,
    colour: Sequence[int],
    rng: random.Random,
) -> None:
    """A lit sphere in the catalog's colour for this world.

    Lambert shading with the light up and to the left, a limb highlight, and gentle
    latitude banding so the disc reads as a body rather than a circle of flat colour. The
    bands are noise, not data — no archive column describes what a planet's clouds look
    like, and pretending otherwise on a card full of real measurements would be the one
    dishonest thing on it. They stay subtle for that reason.
    """
    height, width, _ = canvas.shape
    y0, y1 = max(0, int(cy - radius) - 2), min(height, int(cy + radius) + 3)
    x0, x1 = max(0, int(cx - radius) - 2), min(width, int(cx + radius) + 3)
    if y0 >= y1 or x0 >= x1:
        return

    yy = (np.arange(y0, y1, dtype=np.float32)[:, None] - cy) / radius
    xx = (np.arange(x0, x1, dtype=np.float32)[None, :] - cx) / radius
    r2 = xx * xx + yy * yy

    # One pixel of feather at the limb; the downscale finishes the job.
    edge = np.clip((1.0 - np.sqrt(np.maximum(r2, 0.0))) * radius, 0.0, 1.0)
    z = np.sqrt(np.clip(1.0 - r2, 0.0, 1.0))

    light = np.array((-0.48, -0.55, 0.68), dtype=np.float32)
    light /= float(np.linalg.norm(light))
    lambert = np.clip(xx * light[0] + yy * light[1] + z * light[2], 0.0, 1.0)

    phase = rng.uniform(0.0, math.tau)
    bands = 1.0 + 0.07 * np.sin(yy * 7.5 + phase) * np.cos(xx * 1.7 + phase * 0.5)

    base = np.asarray(colour, dtype=np.float32) / 255.0
    shade = (0.10 + 0.95 * lambert**0.85) * bands
    body = base[None, None, :] * shade[:, :, None]

    # Limb light: a thin brightening at the edge of the disc, which is what stops a
    # shaded sphere from looking like a gradient-filled circle.
    rim = np.clip(1.0 - z, 0.0, 1.0) ** 6 * np.clip(lambert + 0.25, 0.0, 1.0)
    body += (base * 0.5 + 0.5)[None, None, :] * rim[:, :, None] * 0.55

    region = canvas[y0:y1, x0:x1]
    canvas[y0:y1, x0:x1] = region * (1.0 - edge[:, :, None]) + body * edge[:, :, None]


def _draw_cluster(canvas: np.ndarray, cx: float, cy: float, radius: float, rng: random.Random) -> None:
    """The stand-in for a disc on a card about the whole map: a scatter of worlds.

    Not a projection of the real catalog. It is decoration, and it is drawn as a loose
    cloud precisely so that nobody tries to read positions off it.
    """
    warm = np.array((1.0, 0.86, 0.62), dtype=np.float32)
    cool = np.asarray(_ACCENT, dtype=np.float32) / 255.0
    # Sized in supersampled pixels, so a dot survives the downscale as a dot rather than
    # as a lighter shade of sky.
    for _ in range(220):
        angle = rng.uniform(0, math.tau)
        # sqrt keeps the density even instead of piling everything at the centre.
        dist = math.sqrt(rng.random()) * radius
        x, y = cx + math.cos(angle) * dist, cy + math.sin(angle) * dist * 0.92
        fade = 0.35 + 0.65 * (1.0 - dist / radius) ** 0.7
        size = SUPERSAMPLE * (2 if rng.random() < 0.22 else 1)
        hue = cool if rng.random() < 0.4 else warm
        yi, xi = int(y), int(x)
        if 0 <= yi < canvas.shape[0] - size and 0 <= xi < canvas.shape[1] - size:
            canvas[yi : yi + size, xi : xi + size] += hue * (0.5 + 0.9 * rng.random()) * fade


def _tracked(
    draw: ImageDraw.ImageDraw,
    xy: tuple[int, int],
    text: str,
    font: ImageFont.FreeTypeFont,
    fill: tuple[int, int, int],
    tracking: float = 0.0,
) -> int:
    """Draw text with letter spacing, returning the width used.

    Pillow has no tracking, and the small uppercase labels on this card need it: at 16px
    an unspaced run of capitals reads as one long word.
    """
    x, y = xy
    for ch in text:
        draw.text((x, y), ch, font=font, fill=fill)
        x += draw.textlength(ch, font=font) + tracking
    return int(x - xy[0] - (tracking if text else 0))


def _tracked_width(
    draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, tracking: float
) -> int:
    if not text:
        return 0
    return int(draw.textlength(text, font=font) + tracking * (len(text) - 1))


def _fit_font(
    draw: ImageDraw.ImageDraw, text: str, sizes: Sequence[int], max_width: int
) -> ImageFont.FreeTypeFont:
    """The largest size in `sizes` that fits, or the smallest one tried.

    Planet names run from "Earth" to "2MASS J2126-8140 b"; a fixed size either wastes the
    line or overruns the card.
    """
    font = _font(sizes[-1])
    for size in sizes:
        candidate = _font(size)
        if draw.textlength(text, font=candidate) <= max_width:
            return candidate
        font = candidate
    return font


def _ellipsise(
    draw: ImageDraw.ImageDraw, text: str, font: ImageFont.FreeTypeFont, max_width: int
) -> str:
    if draw.textlength(text, font=font) <= max_width:
        return text
    while text and draw.textlength(text + "...", font=font) > max_width:
        text = text[:-1]
    return text.rstrip() + "..."


def _rounded_bar(draw: ImageDraw.ImageDraw, box: tuple[int, int, int, int], fill: Any) -> None:
    x0, y0, x1, y1 = box
    if x1 - x0 < 2:
        return
    draw.rounded_rectangle(box, radius=(y1 - y0) // 2, fill=fill)


def render(card: Card) -> bytes:
    """The card as PNG bytes.

    Deterministic: the same `Card` always renders the same bytes, which is what lets the
    route hand out a strong ETag and lets a CDN keep the result.
    """
    big_w, big_h = CARD_WIDTH * SUPERSAMPLE, CARD_HEIGHT * SUPERSAMPLE
    rng = _rng(card.slug or card.title)

    canvas = _sky(big_w, big_h)
    _add_stars(canvas, rng, count=520)

    disc_cx, disc_cy = 310 * SUPERSAMPLE, 296 * SUPERSAMPLE
    disc_r = 166 * SUPERSAMPLE

    if card.planet is not None:
        tint = np.asarray(card.planet, dtype=np.float32) / 255.0
        _add_glow(canvas, disc_cx, disc_cy, disc_r * 2.1, tint * 0.55 + 0.12, strength=0.5)
        _draw_planet(canvas, disc_cx, disc_cy, disc_r, card.planet, rng)
    else:
        _add_glow(
            canvas,
            disc_cx,
            disc_cy,
            disc_r * 2.0,
            np.asarray(_ACCENT, dtype=np.float32) / 255.0,
            strength=0.16,
        )
        _draw_cluster(canvas, disc_cx, disc_cy, disc_r * 1.5, rng)

    image = Image.fromarray((np.clip(canvas, 0.0, 1.0) * 255.0).astype(np.uint8), mode="RGB")
    image = image.resize((CARD_WIDTH, CARD_HEIGHT), Image.LANCZOS).convert("RGBA")

    overlay = Image.new("RGBA", (CARD_WIDTH, CARD_HEIGHT), (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)

    left = 556
    right = CARD_WIDTH - 64
    column = right - left

    _tracked(draw, (left, 92), ascii_text(card.eyebrow), _font(17), _ACCENT, tracking=3.2)

    # Faux-bold by stroking: the bundled face has one weight, and a headline that weighs
    # the same as its own caption has no hierarchy at thumbnail size.
    title = ascii_text(card.title)
    title_font = _fit_font(draw, title, (58, 52, 46, 40, 34), column)
    draw.text(
        (left, 122),
        _ellipsise(draw, title, title_font, column),
        font=title_font,
        fill=_INK,
        stroke_width=1,
        stroke_fill=_INK,
    )

    subtitle_font = _font(23)
    draw.text(
        (left, 122 + title_font.size + 24),
        _ellipsise(draw, ascii_text(card.subtitle), subtitle_font, column),
        font=subtitle_font,
        fill=_MUTED,
    )

    rule_y = 250
    draw.line((left, rule_y, right, rule_y), fill=(255, 255, 255, 30), width=1)

    if card.stats:
        label_font, value_font = _font(16), _font(30)
        col_width = column // 2
        for index, stat in enumerate(card.stats):
            cx = left + (index % 2) * col_width
            cy = rule_y + 32 + (index // 2) * 80
            _tracked(draw, (cx, cy), ascii_text(stat.label), label_font, _DIM, tracking=2.0)
            draw.text(
                (cx, cy + 24),
                _ellipsise(draw, ascii_text(stat.value), value_font, col_width - 20),
                font=value_font,
                fill=_INK,
            )

    if card.chips:
        chip_font = _font(20)
        x, y = left, rule_y + 34
        for chip in card.chips[:6]:
            text = _ellipsise(draw, ascii_text(chip), chip_font, column - 28)
            width = int(draw.textlength(text, font=chip_font)) + 28
            if x + width > right and x > left:
                x, y = left, y + 48
            if y > 470:
                break
            draw.rounded_rectangle(
                (x, y, x + width, y + 38), radius=19, fill=(255, 255, 255, 16), outline=(34, 211, 238, 70)
            )
            draw.text((x + 14, y + 7), text, font=chip_font, fill=_INK)
            x += width + 10

    if card.habitability is not None:
        bar_y = 516
        colour = _HABITABLE if card.habitable else _ACCENT
        _tracked(draw, (left, bar_y), "HABITABILITY", _font(16), _DIM, tracking=2.0)
        score_font = _font(20)
        score = f"{card.habitability} / 100"
        draw.text(
            (right - draw.textlength(score, font=score_font), bar_y - 4),
            score,
            font=score_font,
            fill=colour,
        )
        _rounded_bar(draw, (left, bar_y + 28, right, bar_y + 38), (255, 255, 255, 28))
        filled = left + int(column * max(0, min(100, card.habitability)) / 100)
        _rounded_bar(draw, (left, bar_y + 28, filled, bar_y + 38), colour)

    if card.habitable:
        badge_font = _font(16)
        text = "POTENTIALLY HABITABLE"
        width = _tracked_width(draw, text, badge_font, 1.6) + 32
        bx = 310 - width // 2
        draw.rounded_rectangle(
            (bx, 508, bx + width, 546), radius=19, fill=(74, 222, 128, 30), outline=(74, 222, 128, 120)
        )
        _tracked(draw, (bx + 16, 517), text, badge_font, _HABITABLE, tracking=1.6)

    footer_font = _font(16)
    _tracked(draw, (64, CARD_HEIGHT - 48), ascii_text(card.footer), footer_font, _DIM, tracking=2.4)
    if card.slug:
        slug = f"/s/{ascii_text(card.slug)}"
        draw.text(
            (right - draw.textlength(slug, font=footer_font), CARD_HEIGHT - 48),
            slug,
            font=footer_font,
            fill=_DIM,
        )

    image = Image.alpha_composite(image, overlay).convert("RGB")

    buffer = io.BytesIO()
    # optimize= costs a few milliseconds and takes roughly a fifth off a card that is
    # mostly flat sky. The result is cached and served many times, so it is worth it.
    image.save(buffer, format="PNG", optimize=True)
    return buffer.getvalue()
