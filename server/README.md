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

FastAPI · asyncpg · Postgres 17 · Redis 8 · numpy · httpx · uvicorn · argon2

## Quick start

From the repository root, start the database and Redis:

```bash
docker compose up -d db redis
```

Redis is optional — presence falls back to a single-process registry without it, and the
API logs which mode it started in — but it is one container and it is what makes presence
work across more than one API process.

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

Accounts and presence (Phase 3):

| Route | Purpose |
| --- | --- |
| `POST /v1/auth/register` | Create an account and start a session |
| `POST /v1/auth/login` | Start a session. Rate limited per address and email |
| `POST /v1/auth/logout` | Delete the session row and clear the cookie |
| `GET /v1/auth/me` | The current user, or `null` when signed out |
| `GET·POST /v1/me/bookmarks`, `DELETE /v1/me/bookmarks/{planet_id}` | Saved planets |
| `GET·POST /v1/me/filters`, `DELETE /v1/me/filters/{id}` | Saved filter presets |
| `GET /v1/presence` | Who is online, and which fan-out backend is live |
| `WS /v1/ws/presence` | The presence socket itself |

## Accounts

Sessions are **opaque random tokens, not JWTs**. 32 bytes from `secrets.token_urlsafe`
go to the browser in an httpOnly, SameSite=Lax cookie; only the SHA-256 of the token is
stored. That means a database leak hands out no live sessions, and `DELETE` on one row
revokes access immediately — a JWT cannot be revoked without a denylist, which is this
same table with extra steps.

Passwords are hashed with Argon2id (`argon2-cffi`), whose parameters travel inside the
hash string, so raising them later re-hashes each account on its next login instead of
invalidating it. Login answers "email or password is incorrect" for both a wrong password
and an unknown address, and spends roughly the same time on each, so the endpoint is not
an account-existence oracle.

## Presence

`app/presence.py` solves two problems that are easy to conflate:

* **Fan-out.** A WebSocket lives inside one process. Every process publishes its events to
  one Redis channel and subscribes to that same channel, so a visitor on process A sees
  one on process B. Without Redis the hub uses an in-memory backend — correct, but single
  process — and says so at startup and in `GET /v1/presence`.
* **Liveness.** A force-quit tab never sends a close frame, so each peer record carries a
  TTL that the browser refreshes with a heartbeat. A sweeper turns expiries into `leave`
  events. `GET /health` reports which backend is running.

The subscribe loop resubscribes with backoff rather than ending when Redis drops. That
matters more than it looks: if the task simply exited, the process would go on accepting
WebSockets and forwarding nothing, which looks healthy from every angle.

Visitors never send their own display name: anonymous ones get a callsign derived from
their peer id, and signed-in ones are named from the session cookie that rode along with
the WebSocket handshake. Nobody can sign the presence list as somebody else.

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
│   ├── config.py        Environment-backed settings
│   ├── security.py      Password hashing, session tokens, input rules (no I/O)
│   ├── auth.py          Users and sessions in Postgres, FastAPI dependencies
│   ├── presence.py      Presence hub: Redis pub/sub, or in-memory fallback
│   ├── redis_client.py  One shared, optional Redis connection
│   ├── ratelimit.py     Fixed-window counter for the login endpoint
│   ├── routes_account.py  Auth, bookmarks, saved filters
│   └── routes_presence.py The WebSocket and a snapshot endpoint
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
- **`COOKIE_SECURE`** must be set to `true` behind HTTPS, or the session cookie will be
  sent over plain http. It defaults to `false` because local development is
  `http://localhost`.
- **The login rate limiter trusts `X-Forwarded-For`.** That is correct behind our own
  reverse proxy and wrong if the API is ever exposed directly, where the header is
  spoofable.
