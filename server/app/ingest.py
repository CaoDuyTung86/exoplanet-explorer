"""Ingest: NASA Exoplanet Archive -> derived values -> Postgres.

This is the job that makes the whole thing a system rather than a page. It runs on a
schedule (nightly is plenty — the archive updates weekly), and after it has run once the
app no longer depends on NASA being reachable at request time.

Run it manually with:  python -m app.ingest
"""

from __future__ import annotations

import asyncio
import json
import logging
import time
from typing import Any

import httpx

from . import db
from .config import get_settings
from .solar_system import SOLAR_SYSTEM
from .transform import derive, slugify

log = logging.getLogger(__name__)

# Only the columns the app actually uses. Asking for fewer columns is the difference
# between a ~4 MB response and a ~30 MB one.
NASA_COLUMNS = (
    "pl_name, hostname, sy_dist, pl_rade, pl_bmasse, pl_eqt, pl_orbper, pl_orbsmax, "
    "discoverymethod, disc_year, disc_telescope, st_teff, st_rad, st_spectype, ra, dec"
)

NASA_QUERY = (
    f"SELECT {NASA_COLUMNS} FROM pscomppars "
    "WHERE pl_rade IS NOT NULL AND sy_dist IS NOT NULL "
    "ORDER BY sy_dist ASC"
)

# Raw values worth keeping a history of. A change here means NASA refined a measurement,
# which is exactly the kind of event the archive itself does not let you look back on.
TRACKED_FIELDS = (
    "sy_dist", "pl_rade", "pl_bmasse", "pl_eqt", "pl_orbper", "pl_orbsmax",
    "st_teff", "st_rad", "st_spectype", "disc_year", "habitability_score",
)

UPSERT_SQL = """
INSERT INTO planets (
    id, pl_name, hostname,
    sy_dist, pl_rade, pl_bmasse, pl_eqt, pl_orbper, pl_orbsmax,
    discoverymethod, disc_year, disc_telescope,
    st_teff, st_rad, st_spectype, ra, dec,
    distance_ly, insolation, habitability_score, is_habitable, size_category,
    pos_x, pos_y, pos_z, color_r, color_g, color_b, visual_radius,
    is_solar_system, first_seen_run, last_seen_run, updated_at
) VALUES (
    $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17,
    $18, $19, $20, $21, $22, $23, $24, $25, $26, $27, $28, $29, $30, $31, $31, now()
)
ON CONFLICT (id) DO UPDATE SET
    pl_name = EXCLUDED.pl_name,
    hostname = EXCLUDED.hostname,
    sy_dist = EXCLUDED.sy_dist,
    pl_rade = EXCLUDED.pl_rade,
    pl_bmasse = EXCLUDED.pl_bmasse,
    pl_eqt = EXCLUDED.pl_eqt,
    pl_orbper = EXCLUDED.pl_orbper,
    pl_orbsmax = EXCLUDED.pl_orbsmax,
    discoverymethod = EXCLUDED.discoverymethod,
    disc_year = EXCLUDED.disc_year,
    disc_telescope = EXCLUDED.disc_telescope,
    st_teff = EXCLUDED.st_teff,
    st_rad = EXCLUDED.st_rad,
    st_spectype = EXCLUDED.st_spectype,
    ra = EXCLUDED.ra,
    dec = EXCLUDED.dec,
    distance_ly = EXCLUDED.distance_ly,
    insolation = EXCLUDED.insolation,
    habitability_score = EXCLUDED.habitability_score,
    is_habitable = EXCLUDED.is_habitable,
    size_category = EXCLUDED.size_category,
    pos_x = EXCLUDED.pos_x,
    pos_y = EXCLUDED.pos_y,
    pos_z = EXCLUDED.pos_z,
    color_r = EXCLUDED.color_r,
    color_g = EXCLUDED.color_g,
    color_b = EXCLUDED.color_b,
    visual_radius = EXCLUDED.visual_radius,
    last_seen_run = EXCLUDED.last_seen_run,
    updated_at = now()
"""


async def fetch_from_nasa() -> list[dict[str, Any]]:
    """Pull the catalog from the TAP service.

    Note this runs on our server, so there is no CORS problem and no need for the
    third-party proxy the browser used to fall back to.
    """
    settings = get_settings()
    params = {"query": NASA_QUERY, "format": "json"}

    log.info("fetching catalog from %s", settings.nasa_tap_url)
    async with httpx.AsyncClient(timeout=settings.nasa_timeout_seconds) as client:
        response = await client.get(settings.nasa_tap_url, params=params)
        response.raise_for_status()
        rows = response.json()

    if not isinstance(rows, list) or not rows:
        raise ValueError(f"NASA returned an unexpected payload: {type(rows).__name__}")

    log.info("fetched %d rows", len(rows))
    return rows


def _row_to_record(row: dict[str, Any], index: int, run_id: int) -> tuple[Any, ...]:
    d = derive(row, index)
    return (
        slugify(row["pl_name"]),
        row["pl_name"],
        row.get("hostname") or "Unknown",
        row.get("sy_dist"), row.get("pl_rade"), row.get("pl_bmasse"), row.get("pl_eqt"),
        row.get("pl_orbper"), row.get("pl_orbsmax"),
        row.get("discoverymethod"), row.get("disc_year"), row.get("disc_telescope"),
        row.get("st_teff"), row.get("st_rad"), row.get("st_spectype"),
        row.get("ra"), row.get("dec"),
        d.distance_ly, d.insolation, d.habitability_score, d.is_habitable, d.size_category,
        *d.pos, *d.color, d.visual_radius,
        False, run_id,
    )


def _solar_record(body: dict[str, Any], run_id: int) -> tuple[Any, ...]:
    return (
        body["id"], body["pl_name"], body["hostname"],
        body["sy_dist"], body["pl_rade"], body["pl_bmasse"], body["pl_eqt"],
        body["pl_orbper"], body["pl_orbsmax"],
        body["discoverymethod"], body["disc_year"], body["disc_telescope"],
        body["st_teff"], body["st_rad"], body["st_spectype"], body["ra"], body["dec"],
        body["distance_ly"], body["insolation"], body["habitability_score"],
        body["is_habitable"], body["size_category"],
        body["pos_x"], body["pos_y"], body["pos_z"],
        body["color_r"], body["color_g"], body["color_b"], body["visual_radius"],
        True, run_id,
    )


async def run_ingest() -> dict[str, Any]:
    """Fetch, derive, diff and upsert. Returns a summary of the run."""
    started = time.perf_counter()
    conn_pool = db.pool()

    async with conn_pool.acquire() as conn:
        run_id = await conn.fetchval(
            "INSERT INTO ingest_runs (status) VALUES ('running') RETURNING id"
        )

    try:
        raw_rows = await fetch_from_nasa()

        records = [_row_to_record(row, i, run_id) for i, row in enumerate(raw_rows)]
        records.extend(_solar_record(body, run_id) for body in SOLAR_SYSTEM)

        async with conn_pool.acquire() as conn:
            # Snapshot the tracked fields before the upsert overwrites them.
            existing = {
                r["id"]: dict(r)
                for r in await conn.fetch(
                    f"SELECT id, {', '.join(TRACKED_FIELDS)} FROM planets"
                )
            }

            changed: list[tuple[str, int, str]] = []
            for record in records:
                planet_id = record[0]
                previous = existing.get(planet_id)
                if previous is None:
                    continue  # brand new planet; nothing to record a change against
                incoming = _tracked_from_record(record)
                if any(_differs(previous[f], incoming[f]) for f in TRACKED_FIELDS):
                    changed.append((planet_id, run_id, json.dumps(previous, default=str)))

            async with conn.transaction():
                await conn.executemany(UPSERT_SQL, records)
                if changed:
                    await conn.executemany(
                        "INSERT INTO planet_history (planet_id, run_id, previous) "
                        "VALUES ($1, $2, $3::jsonb)",
                        changed,
                    )

            duration_ms = int((time.perf_counter() - started) * 1000)
            await conn.execute(
                """
                UPDATE ingest_runs
                   SET status = 'success', finished_at = now(),
                       rows_fetched = $2, rows_upserted = $3, rows_changed = $4,
                       duration_ms = $5
                 WHERE id = $1
                """,
                run_id, len(raw_rows), len(records), len(changed), duration_ms,
            )

        summary = {
            "run_id": run_id,
            "rows_fetched": len(raw_rows),
            "rows_upserted": len(records),
            "rows_changed": len(changed),
            "duration_ms": duration_ms,
        }
        log.info("ingest complete: %s", summary)
        return summary

    except Exception as exc:  # noqa: BLE001 — the failure must be recorded, then re-raised
        async with conn_pool.acquire() as conn:
            await conn.execute(
                "UPDATE ingest_runs SET status = 'failed', finished_at = now(), error = $2 "
                "WHERE id = $1",
                run_id, f"{type(exc).__name__}: {exc}",
            )
        log.exception("ingest failed")
        raise


# Index of each tracked field inside the tuple built by _row_to_record.
_RECORD_INDEX = {
    "sy_dist": 3, "pl_rade": 4, "pl_bmasse": 5, "pl_eqt": 6, "pl_orbper": 7,
    "pl_orbsmax": 8, "disc_year": 10, "st_teff": 12, "st_rad": 13,
    "st_spectype": 14, "habitability_score": 19,
}


def _tracked_from_record(record: tuple[Any, ...]) -> dict[str, Any]:
    return {field: record[i] for field, i in _RECORD_INDEX.items()}


def _differs(old: Any, new: Any) -> bool:
    if old is None or new is None:
        return old is not new
    if isinstance(old, float) and isinstance(new, (int, float)):
        # NASA republishes values with varying precision; ignore floating-point noise.
        return abs(old - new) > 1e-9
    return old != new


async def _main() -> None:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    await db.connect()
    try:
        await db.run_migrations()
        await run_ingest()
    finally:
        await db.disconnect()


if __name__ == "__main__":
    asyncio.run(_main())
