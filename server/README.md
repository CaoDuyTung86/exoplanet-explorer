# Exoplanet Explorer API

The backend that stands between the browser and the NASA Exoplanet Archive.

## Why this exists

The frontend used to call NASA's TAP service directly from every visitor's browser: it
downloaded ~2.4 MB of JSON on every page load, then recomputed habitability scores and 3D
positions for ~6,300 planets in a Web Worker before anything could be drawn. If NASA was
slow, rate-limiting, or down, the app was too — and because a public CORS proxy sat in the
production path, it often was.

This service ingests the archive **once per run** on a schedule, stores the derived values
in Postgres, and serves the result as a packed binary the renderer can hand almost
directly to the GPU. NASA is now a source we pull from, not a dependency we hit at request
time.

## Stack

FastAPI · asyncpg · Postgres 17 · numpy · httpx · uvicorn

## Quick start

From the repository root, start the database:

```bash
docker compose up -d db
```

Then create the environment and run the first ingest (this applies migrations too):

```bash
cd server && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements-dev.txt
```

```bash
cd server && .venv/Scripts/python -m app.ingest
```

```bash
cd server && .venv/Scripts/python -m uvicorn app.main:app --reload
```

The API listens on `http://127.0.0.1:8000`; the Vite dev server proxies `/api/v1` to it,
so the frontend needs no configuration. Interactive docs are at `/docs`.

On Linux or macOS, use `.venv/bin/python` instead of `.venv/Scripts/python`.

To run the API in a container instead of on the host:

```bash
docker compose --profile api up -d --build
```

## Endpoints

| Route | Purpose |
| --- | --- |
| `GET /health` | Liveness plus a database round-trip |
| `GET /v1/version` | Current ingest run id, planet count, last ingest stats |
| `GET /v1/catalog.bin` | Positions, colours and numeric columns as one `ArrayBuffer` |
| `GET /v1/catalog/meta` | Names and dictionary-encoded string columns, same row order |
| `GET /v1/planets/{id}` | Full record for one planet |
| `GET /v1/stats` | Aggregates for the stats panel, computed in SQL |
| `POST /v1/admin/ingest` | Trigger an ingest. **Needs auth before this is public.** |

## The binary format

`GET /v1/catalog.bin` returns a single buffer. The 56-byte header carries a magic number,
a format version, the planet count, the ingest run id, and an explicit byte offset for
every section, so a client can gain or skip a column without guessing at the layout.

Sections are stored column-major: all x/y/z, then all radii, then the numeric block, then
the small integer columns. That means the client creates one typed-array view per column
and does no parsing and no per-planet object allocation.

Measured against the real catalog (6,287 planets, including the nine seeded Solar System
bodies):

| | Old: NASA JSON | New: `catalog.bin` |
| --- | --- | --- |
| Raw | 2,431.8 KB | 368.4 KB |
| Over the wire (gzip) | 330.3 KB | 226.5 KB |
| Client-side work | `JSON.parse` + ~6,300 objects + trig per planet | typed-array views |
| Repeat visit | full download | `304 Not Modified`, 0 bytes |

Text columns are served separately at `/v1/catalog/meta` (68.1 KB gzipped) because names
are only needed on hover or in the table — long after the first frame is on screen.

Encoder: `app/catalog.py`. Decoder: `src/features/explorer/services/catalogApi.ts`. The two
are pinned together by `tests/test_catalog.py`, which asserts the header, every section
offset, alignment for odd planet counts, and the round-trip of each column.

## Layout

```
server/
├── app/
│   ├── main.py          FastAPI app, routes, in-memory catalog cache
│   ├── ingest.py        NASA TAP -> derive -> diff -> upsert
│   ├── transform.py     Habitability, categories, colours, 3D projection
│   ├── catalog.py       Binary encoder and metadata builder
│   ├── solar_system.py  The nine seeded Solar System bodies
│   ├── db.py            asyncpg pool and migration runner
│   └── config.py        Environment-backed settings
├── migrations/          Plain .sql, applied in filename order
└── tests/               pytest, no database required
```

## Tests

```bash
cd server && .venv/Scripts/python -m pytest -q
```

The suite covers the pure domain logic and the wire format, so it needs no database and
runs in about a second. The transform tests exist specifically to catch the Python port
drifting from the TypeScript original it replaced.

## Notes

- **Migrations** are plain SQL applied in filename order with a `schema_migrations`
  ledger, one transaction per file. Alembic is the right call once the schema starts
  churning; it is overkill for four tables.
- **`planet_history`** records the previous values whenever an ingest sees a measurement
  change. NASA only ever serves the present, so this history does not exist anywhere
  unless we keep it — it is what makes the planned catalog time-machine possible.
- **Planet ids** are slugs of the planet name, not array indices. The old
  `exo-${index}` scheme renumbered every planet whenever NASA added a nearer one, which
  would break saved links the moment sharing ships.
- **`POST /v1/admin/ingest`** is unauthenticated. It is fine on a laptop and must not be
  exposed as-is.
