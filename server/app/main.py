"""FastAPI application — the catalog API the browser talks to instead of NASA."""

from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager
from typing import Any

from fastapi import FastAPI, HTTPException, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse

from . import (
    auth,
    catalog,
    db,
    history,
    presence,
    redis_client,
    routes_account,
    routes_presence,
)
from .config import get_settings
from .ingest import run_ingest

log = logging.getLogger(__name__)

# The encoded catalog is identical for every visitor and changes only when an ingest
# runs, so it is built once and held in memory. ~350 KB is nothing to keep resident, and
# it turns the hot path into a memcpy.
_cache: dict[str, Any] = {"run_id": None, "binary": None, "etag": None, "meta": None}
_cache_lock = asyncio.Lock()


@asynccontextmanager
async def lifespan(app: FastAPI):
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
    await db.connect()
    applied = await db.run_migrations()
    if applied:
        log.info("applied migrations: %s", ", ".join(applied))

    purged = await auth.purge_expired_sessions()
    if purged:
        log.info("purged %d expired session(s)", purged)

    await presence.hub.start()
    yield
    await presence.hub.stop()
    await redis_client.close()
    await db.disconnect()


settings = get_settings()

app = FastAPI(
    title="Exoplanet Explorer API",
    version="1.0.0",
    description=(
        "Serves the NASA Exoplanet Archive catalog, pre-processed and packed as binary "
        "typed arrays for direct upload to the GPU."
    ),
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=settings.cors_origin_list,
    # DELETE is what removes a bookmark or a saved filter.
    allow_methods=["GET", "POST", "DELETE"],
    allow_headers=["*"],
    # The session cookie only travels cross-origin with this on. It is safe alongside an
    # explicit origin list — it would not be with a wildcard, which the browser rejects
    # in combination with credentials anyway.
    allow_credentials=True,
    # Without this the browser cannot read ETag, so conditional requests never kick in.
    expose_headers=["ETag", "X-Catalog-Run-Id"],
)
# The binary payload is already compact; JSON metadata is what benefits from gzip.
app.add_middleware(GZipMiddleware, minimum_size=1024)


async def _current_run_id() -> int | None:
    return await db.pool().fetchval(
        "SELECT id FROM ingest_runs WHERE status = 'success' ORDER BY id DESC LIMIT 1"
    )


async def _ensure_cache() -> dict[str, Any]:
    """Rebuild the cached payloads if an ingest has landed since we last looked."""
    run_id = await _current_run_id()
    if run_id is None:
        raise HTTPException(
            status_code=503,
            detail="Catalog is empty — no successful ingest yet. Run: python -m app.ingest",
        )

    if _cache["run_id"] == run_id:
        return _cache

    async with _cache_lock:
        if _cache["run_id"] == run_id:  # another request won the race
            return _cache

        rows = await db.pool().fetch(catalog.CATALOG_SQL)
        payload = catalog.encode(rows, run_id)
        _cache.update(
            run_id=run_id,
            binary=payload,
            etag=catalog.etag(payload),
            meta=catalog.build_metadata(rows, run_id),
        )
        log.info("catalog cache built: run %s, %d planets, %.1f KB",
                 run_id, len(rows), len(payload) / 1024)

    return _cache


@app.get("/health", tags=["ops"])
async def health() -> dict[str, Any]:
    try:
        await db.pool().fetchval("SELECT 1")
    except Exception as exc:  # noqa: BLE001
        raise HTTPException(status_code=503, detail=f"database unreachable: {exc}") from exc
    # Redis being down is not unhealthy — presence degrades to a single process and the
    # app keeps working — so it is reported rather than turned into a 503.
    return {"status": "ok", "presenceBackend": presence.hub.backend_name}


@app.get("/v1/version", tags=["catalog"])
async def version() -> dict[str, Any]:
    """What the client polls to find out whether its cached catalog is stale."""
    row = await db.pool().fetchrow(
        """
        SELECT id, finished_at, rows_fetched, rows_upserted, rows_changed, duration_ms
          FROM ingest_runs WHERE status = 'success' ORDER BY id DESC LIMIT 1
        """
    )
    if row is None:
        return {"runId": None, "planetCount": 0, "ingestedAt": None}

    count = await db.pool().fetchval("SELECT count(*) FROM planets")
    return {
        "runId": row["id"],
        "planetCount": count,
        "ingestedAt": row["finished_at"],
        "rowsFetched": row["rows_fetched"],
        "rowsChanged": row["rows_changed"],
        "ingestDurationMs": row["duration_ms"],
    }


@app.get("/v1/catalog.bin", tags=["catalog"])
async def catalog_binary(request: Request) -> Response:
    """Positions, colours and the numeric columns, as one packed ArrayBuffer."""
    cache = await _ensure_cache()

    # A client that already holds this exact payload gets a 304 and downloads nothing.
    if request.headers.get("if-none-match") == cache["etag"]:
        return Response(status_code=304, headers={"ETag": cache["etag"]})

    versioned = request.query_params.get("v") == str(cache["run_id"])
    cache_control = (
        f"public, max-age={settings.catalog_max_age_seconds}, immutable"
        if versioned
        else "public, max-age=300, must-revalidate"
    )

    return Response(
        content=cache["binary"],
        media_type="application/octet-stream",
        headers={
            "ETag": cache["etag"],
            "Cache-Control": cache_control,
            "X-Catalog-Run-Id": str(cache["run_id"]),
        },
    )


@app.get("/v1/catalog/meta", tags=["catalog"])
async def catalog_meta(request: Request) -> Response:
    """Names and dictionary-encoded string columns, in the same row order as the binary."""
    cache = await _ensure_cache()
    return JSONResponse(
        content=cache["meta"],
        headers={
            "Cache-Control": "public, max-age=300, must-revalidate",
            "X-Catalog-Run-Id": str(cache["run_id"]),
        },
    )


@app.get("/v1/planets/{planet_id}", tags=["catalog"])
async def planet_detail(planet_id: str) -> dict[str, Any]:
    row = await db.pool().fetchrow("SELECT * FROM planets WHERE id = $1", planet_id)
    if row is None:
        raise HTTPException(status_code=404, detail=f"No planet with id {planet_id!r}")
    return dict(row)


@app.get("/v1/planets/{planet_id}/history", tags=["catalog"])
async def planet_history(planet_id: str) -> dict[str, Any]:
    """How this planet's measurements were revised, run by run.

    This is the half of the time machine that NASA cannot serve. The archive only ever
    returns the present, so a radius refined last month simply overwrote the old value
    there. Here every ingest since Phase 2 diffed the incoming row against the stored one
    and kept whatever it replaced, which makes the revisions replayable.
    """
    current = await db.pool().fetchrow("SELECT * FROM planets WHERE id = $1", planet_id)
    if current is None:
        raise HTTPException(status_code=404, detail=f"No planet with id {planet_id!r}")

    rows = await db.pool().fetch(
        """
        SELECT run_id, changed_at, previous
          FROM planet_history
         WHERE planet_id = $1
         ORDER BY run_id ASC
        """,
        planet_id,
    )

    # asyncpg hands back JSONB as text unless a codec is registered; one json.loads here
    # is cheaper than a pool-wide codec for the only endpoint that reads the column.
    parsed = [
        {
            "run_id": row["run_id"],
            "changed_at": row["changed_at"],
            "previous": json.loads(row["previous"]) if isinstance(row["previous"], str)
            else row["previous"],
        }
        for row in rows
    ]

    revisions = history.build_revisions(parsed, dict(current))
    for revision in revisions:
        revision["changedAt"] = history.to_iso(revision["changedAt"])

    return {
        "planetId": planet_id,
        "name": current["pl_name"],
        "discoveryYear": current["disc_year"],
        "firstSeenRun": current["first_seen_run"],
        # Rows recorded minus rows we can describe: an ingest can touch a tracked field
        # the detail card does not display, and saying "3 revisions" while listing one
        # would be worse than saying so.
        "recordedRuns": len(parsed),
        "revisions": revisions,
    }


@app.get("/v1/timeline", tags=["catalog"])
async def timeline() -> Response:
    """Discoveries per year, cumulative, with each year's most habitable find.

    Drives the time machine's scrubber. It changes only when an ingest lands, so it is
    revalidated rather than recomputed on every scrub.
    """
    conn_pool = db.pool()
    year_rows = await conn_pool.fetch(
        """
        SELECT disc_year                                  AS year,
               count(*)                                   AS count,
               count(*) FILTER (WHERE is_habitable)       AS habitable,
               mode() WITHIN GROUP (ORDER BY discoverymethod) AS top_method
          FROM planets
         WHERE NOT is_solar_system AND disc_year IS NOT NULL AND disc_year > 0
         GROUP BY disc_year
         ORDER BY disc_year
        """
    )
    # DISTINCT ON picks one row per year in a single index-ordered pass, rather than a
    # window function over the whole table.
    notable_rows = await conn_pool.fetch(
        """
        SELECT DISTINCT ON (disc_year)
               disc_year AS year, id, pl_name, habitability_score
          FROM planets
         WHERE NOT is_solar_system AND disc_year IS NOT NULL AND disc_year > 0
         ORDER BY disc_year, habitability_score DESC, distance_ly ASC NULLS LAST
        """
    )

    payload = history.build_timeline(
        [dict(r) for r in year_rows], [dict(r) for r in notable_rows]
    )
    return JSONResponse(
        content=payload,
        headers={"Cache-Control": "public, max-age=300, must-revalidate"},
    )


@app.get("/v1/stats", tags=["catalog"])
async def stats() -> dict[str, Any]:
    """Aggregates for the stats panel — computed by Postgres, not by 5,700 array passes."""
    conn_pool = db.pool()
    totals = await conn_pool.fetchrow(
        """
        SELECT count(*)                                        AS total,
               count(*) FILTER (WHERE is_habitable)            AS habitable,
               count(DISTINCT hostname)                        AS systems,
               min(distance_ly) FILTER (WHERE NOT is_solar_system) AS nearest_ly,
               avg(pl_rade)                                    AS avg_radius
          FROM planets WHERE NOT is_solar_system
        """
    )
    by_year = await conn_pool.fetch(
        """
        SELECT disc_year AS year, count(*) AS count
          FROM planets
         WHERE NOT is_solar_system AND disc_year IS NOT NULL AND disc_year > 0
         GROUP BY disc_year ORDER BY disc_year
        """
    )
    by_method = await conn_pool.fetch(
        """
        SELECT discoverymethod AS method, count(*) AS count
          FROM planets
         WHERE NOT is_solar_system AND discoverymethod IS NOT NULL
         GROUP BY discoverymethod ORDER BY count DESC
        """
    )
    by_size = await conn_pool.fetch(
        """
        SELECT size_category AS category, count(*) AS count
          FROM planets WHERE NOT is_solar_system
         GROUP BY size_category ORDER BY count DESC
        """
    )
    return {
        "total": totals["total"],
        "habitable": totals["habitable"],
        "systems": totals["systems"],
        "nearestLy": totals["nearest_ly"],
        "avgRadius": totals["avg_radius"],
        "byYear": [dict(r) for r in by_year],
        "byMethod": [dict(r) for r in by_method],
        "bySizeCategory": [dict(r) for r in by_size],
    }


@app.post("/v1/admin/ingest", tags=["ops"])
async def trigger_ingest() -> dict[str, Any]:
    """Run an ingest on demand.

    Convenient in development. Before this is exposed anywhere public it needs an auth
    check — it makes an outbound request to NASA and writes to every row in the table.
    """
    summary = await run_ingest()
    _cache["run_id"] = None  # force a rebuild on the next catalog request
    return summary


app.include_router(routes_account.router)
app.include_router(routes_presence.router)
