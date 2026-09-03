"""The Solar System, seeded rather than fetched.

NASA's ``pscomppars`` table is a catalogue of *exo*planets, so our own system is not in
it. These rows are hand-authored (ported from ``SOLAR_SYSTEM_PLANETS`` in
``nasaApi.ts``) and given fixed positions along the x axis at the origin of the scene,
where they act as the reference frame every exoplanet is judged against.

They are flagged ``is_solar_system`` in the database so an ingest never deletes them and
the API can keep them out of "planets discovered per year" style statistics.
"""

from __future__ import annotations

from typing import Any

_SUN_LIKE = {"st_teff": 5778.0, "st_rad": 1.0, "st_spectype": "G2V", "ra": 0.0, "dec": 0.0}


def _body(
    ident: str,
    name: str,
    *,
    sy_dist: float,
    rade: float,
    masse: float,
    eqt: float,
    orbper: float,
    orbsmax: float,
    method: str,
    year: int,
    telescope: str,
    score: int,
    category: str,
    x: float,
    color: tuple[int, int, int],
    radius: float,
) -> dict[str, Any]:
    return {
        "id": ident,
        "pl_name": name,
        "hostname": "Sol",
        "sy_dist": sy_dist,
        "pl_rade": rade,
        "pl_bmasse": masse,
        "pl_eqt": eqt,
        "pl_orbper": orbper,
        "pl_orbsmax": orbsmax,
        "discoverymethod": method,
        "disc_year": year,
        "disc_telescope": telescope,
        **_SUN_LIKE,
        "distance_ly": sy_dist,
        "insolation": None,
        "habitability_score": score,
        "is_habitable": score >= 40,
        "size_category": category,
        "pos_x": x,
        "pos_y": 0.0,
        "pos_z": 0.0,
        "color_r": color[0],
        "color_g": color[1],
        "color_b": color[2],
        "visual_radius": radius,
        "is_solar_system": True,
    }


SOLAR_SYSTEM: list[dict[str, Any]] = [
    _body(
        "sol-sun", "The Sun (Sol)",
        sy_dist=0.0, rade=109.2, masse=333000.0, eqt=5778.0, orbper=0.0, orbsmax=0.0,
        method="Naked Eye (Origin)", year=0, telescope="Solar System Center",
        score=0, category="Star", x=0.0, color=(255, 217, 51), radius=1.5,
    ),
    _body(
        "sol-mercury", "Mercury",
        sy_dist=0.000006, rade=0.38, masse=0.055, eqt=440.0, orbper=88.0, orbsmax=0.39,
        method="Naked Eye", year=0, telescope="Ancient Astronomy",
        score=0, category="sub-Earth", x=2.4, color=(166, 166, 179), radius=0.35,
    ),
    _body(
        "sol-venus", "Venus",
        sy_dist=0.000011, rade=0.95, masse=0.815, eqt=737.0, orbper=224.7, orbsmax=0.72,
        method="Naked Eye", year=0, telescope="Ancient Astronomy",
        score=5, category="Earth-like", x=3.2, color=(242, 191, 77), radius=0.55,
    ),
    _body(
        "sol-earth", "Earth (Home)",
        sy_dist=0.0000158, rade=1.0, masse=1.0, eqt=255.0, orbper=365.25, orbsmax=1.0,
        method="Home Planet", year=0, telescope="Human Cradle",
        score=100, category="Earth-like", x=4.3, color=(51, 153, 255), radius=0.6,
    ),
    _body(
        "sol-mars", "Mars",
        sy_dist=0.000024, rade=0.53, masse=0.11, eqt=210.0, orbper=687.0, orbsmax=1.52,
        method="Naked Eye", year=0, telescope="Ancient Astronomy",
        score=35, category="sub-Earth", x=5.6, color=(242, 89, 51), radius=0.45,
    ),
    _body(
        "sol-jupiter", "Jupiter",
        sy_dist=0.000082, rade=11.2, masse=317.8, eqt=110.0, orbper=4332.0, orbsmax=5.2,
        method="Naked Eye", year=0, telescope="Galileo 1610",
        score=0, category="gas-giant", x=8.5, color=(217, 140, 77), radius=0.95,
    ),
    _body(
        "sol-saturn", "Saturn",
        sy_dist=0.00015, rade=9.45, masse=95.2, eqt=81.0, orbper=10759.0, orbsmax=9.5,
        method="Naked Eye", year=0, telescope="Galileo 1610",
        score=0, category="gas-giant", x=12.0, color=(242, 217, 128), radius=0.85,
    ),
    _body(
        "sol-uranus", "Uranus",
        sy_dist=0.00030, rade=4.0, masse=14.5, eqt=58.0, orbper=30687.0, orbsmax=19.2,
        method="Telescope", year=1781, telescope="William Herschel",
        score=0, category="Neptune-like", x=15.5, color=(77, 217, 230), radius=0.7,
    ),
    _body(
        "sol-neptune", "Neptune",
        sy_dist=0.00047, rade=3.88, masse=17.1, eqt=46.0, orbper=60190.0, orbsmax=30.1,
        method="Mathematical Prediction", year=1846, telescope="Johann Galle",
        score=0, category="Neptune-like", x=18.5, color=(51, 102, 230), radius=0.68,
    ),
]
