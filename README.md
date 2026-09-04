# 🌌 Exoplanet Explorer 3D

[![CI](https://github.com/CaoDuyTung86/exoplanet-explorer/actions/workflows/ci.yml/badge.svg)](https://github.com/CaoDuyTung86/exoplanet-explorer/actions/workflows/ci.yml)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)

An interactive 3D star map of every confirmed exoplanet in the NASA Exoplanet Archive
(~6,300 worlds), rendered in the browser with WebGL. Fly between star systems, filter by
physical properties, and compare candidates against our own Solar System.

*[Đọc bằng Tiếng Việt →](README-vi.md)*

<img width="675" alt="Exoplanet Explorer banner" src="https://github.com/user-attachments/assets/a48d002b-8743-443f-af0b-f397a3fd9d6b" />

## 🚀 Features

- **Interactive 3D universe** — every planet drawn in a single `THREE.InstancedMesh` draw call,
  with smooth camera interpolation when flying to a system and a spectate mode that tracks
  the target as it orbits.
- **Procedural shaders** — gas giants, lava worlds and rocky planets are shaded by GLSL
  injected into `MeshStandardMaterial` via `onBeforeCompile`, driven by each planet's real
  NASA parameters. No per-planet textures, so the bundle stays small.
- **The Solar System as a reference frame** — the Sun and eight planets sit at the origin with
  real textures, giving every exoplanet a familiar scale to be judged against.
- **Habitability scoring** — a 0–100 heuristic over equilibrium temperature, radius, mass and
  stellar spectral type, visualised with a habitable-zone ring.
- **Server-side data pipeline** — normalisation, habitability scoring and the 3D projection
  run once during ingest, not in every visitor's browser. The client receives packed binary
  and builds typed-array views from it, with no JSON parsing on the critical path.
- **Ambient audio synthesis** — Web Audio oscillators and biquad filters generate a drone per
  planet: pitch follows radius, filter cutoff follows temperature.
- **Filtering and table view** — radius, mass, temperature, distance, orbital period, discovery
  method, spectral class and discovery year, plus a virtualised data table.
- **Accounts** — sign in to keep bookmarked planets and named filter presets on the
  server rather than in one browser. Sessions are opaque tokens in an httpOnly cookie,
  stored only as a hash, so signing out revokes them for real.
- **Realtime presence** — a WebSocket shows who else is on the map and which planet each
  visitor is looking at; click one to fly there. Redis pub/sub carries the events between
  API processes, and a TTL plus heartbeat handles the tab that was force-quit.
- **Most similar worlds** — every planet is reduced to four standardised numbers (radius,
  mass, stellar flux, star temperature) and neighbours are found with a GiST k-NN scan
  over a Postgres `cube`, in about a millisecond. Dimensions the archive never measured
  are imputed to the population mean and *labelled as such*, so an estimate is never
  shown as an observation. Ask it about Earth and it answers Kepler-452 b.
- **Search that forgives how you type** — `kepler 452b`, `KEPLER-452 B` and `keplr-452 b`
  all land on Kepler-452 b. Punctuation is folded away in a generated column, so it never
  reaches the comparison; genuine typos are caught by a `pg_trgm` GIN index. A fuzzy match
  is capped below the literal band, so a guess can add results to the bottom of the list
  but never displace what you actually typed. Ctrl/⌘+K from anywhere.
- **English / Vietnamese** — including a dictionary for astronomical terms
  (*Radial Velocity* → *Vận tốc xuyên tâm*).

## 🛠️ Tech stack

| Layer | Choice |
| --- | --- |
| Frontend | React 19, TypeScript, Vite 8 |
| 3D | Three.js, React Three Fiber, Drei, postprocessing |
| Routing / data | TanStack Router, TanStack Query, TanStack Virtual |
| State | Zustand |
| Styling | Tailwind CSS v4, Lucide icons |
| Audio | Howler.js + native Web Audio API |
| i18n | i18next / react-i18next |
| PWA | vite-plugin-pwa |
| **API** | **Python 3.13, FastAPI, asyncpg, numpy, argon2** |
| **Database** | **Postgres 17 (Docker Compose), `cube` for k-NN** |
| **Realtime** | **WebSocket + Redis 8 pub/sub** |
| Data source | [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/) TAP API (`pscomppars`) |

## 💻 Running locally

```bash
git clone https://github.com/CaoDuyTung86/exoplanet-explorer.git
```

```bash
cd exoplanet-explorer && pnpm install
```

Start Postgres and Redis, then run the first ingest (this also applies the migrations):

```bash
docker compose up -d db redis
```

```bash
cd server && python -m venv .venv && .venv/Scripts/python -m pip install -r requirements-dev.txt
```

```bash
cd server && .venv/Scripts/python -m app.ingest
```

Then run the API and the frontend:

```bash
cd server && .venv/Scripts/python -m uvicorn app.main:app --reload
```

```bash
pnpm dev
```

On Linux or macOS use `.venv/bin/python` instead of `.venv/Scripts/python`.

The frontend is served on port 3001 and proxies `/api/v1` to the API, so no environment
variables are needed. The dot beside the planet count in the header is green when the data
came from the API and amber when the app has fallen back to a degraded source.

**The frontend also runs on its own**, without the backend: it falls back to fetching NASA
directly and computing everything in the browser, and says so in a banner.

Redis is optional too. Without it, presence still works for everyone connected to the same
API process; the API logs which mode it chose and reports it at `GET /health`.

| Script | Purpose |
| --- | --- |
| `pnpm dev` | Vite dev server |
| `pnpm build` | Type-check then production build |
| `pnpm tsc` | Type-check only |
| `pnpm lint` | ESLint |
| `pnpm format` | Prettier write |
| `pytest -q` (in `server/`) | API test suite |

Helper scripts under `scripts/` are one-off asset generators, not part of the build:
`generate_icons.cjs` renders the PNG icon set procedurally, `generate_sounds.cjs` synthesises
the UI sound effects as WAV, and `download_textures.cjs` fetches the Solar System textures.

## 🧠 Technical notes

**InstancedMesh.** Drawing ~6,300 spheres as individual meshes would mean ~6,300 draw calls.
Instead a single instanced mesh carries per-instance matrices and colours. Raycast hit-boxes
scale down while spectating so a nearby planet does not swallow clicks meant for the one
behind it.

**Procedural materials.** Rather than shipping thousands of texture images, Simplex 3D noise is
injected into the standard material's shader chunks. Lighting, shadows and surface detail are
computed on the GPU from the planet's radius, temperature and density.

**StrictMode double-fetch.** React's development StrictMode mounts effects twice, which fired
two catalog requests and occasionally tripped NASA's rate limiting. A module-level promise cache
in `nasaApi.ts` collapses concurrent callers onto one in-flight request.

## 🛰️ Architecture

The browser does not talk to NASA. A scheduled ingest pulls the archive, derives every
computed field once, and stores the result in Postgres; the API then serves it as a packed
binary that the renderer feeds almost directly to the GPU.

```
ingest ──► NASA TAP ──► derive ──► Postgres ──► FastAPI ──► browser
                                                  │
                              /v1/catalog.bin  ───┘  positions, colours, numeric columns
                              /v1/catalog/meta ───►  names and string columns, loaded lazily
```

Measured against the live catalog (6,287 planets):

| | Before: NASA JSON in the browser | After: `catalog.bin` |
| --- | --- | --- |
| Raw payload | 2,431.8 KB | **368.4 KB** |
| Over the wire (gzip) | 330.3 KB | **226.5 KB** |
| Client-side work | `JSON.parse` + ~6,300 objects + trigonometry per planet | typed-array views |
| Repeat visit | full download | **`304`, 0 bytes** |

Removing the public CORS proxy that used to sit in the production path mattered as much as
the size: the app no longer depends on an unaffiliated third party to load its own data.

See [`server/README.md`](server/README.md) for the API, the binary format, and the schema.

## 🗺️ Roadmap

Phases 1 and 2 (the cleanup, and the ingest pipeline behind our own API) are done, and
so is most of Phase 3: accounts, realtime presence, the time machine, similarity search
and typo-tolerant search. Still open there: shareable permalinks and server-rendered
share images. Phase 4 is infrastructure — scheduled ingest first, since the measurement
history only grows when the ingest actually runs.

**See [ROADMAP.md](ROADMAP.md) for the phased plan and current progress.**

## 📄 License

MIT — see [LICENSE](LICENSE).

Exoplanet data courtesy of the [NASA Exoplanet Archive](https://exoplanetarchive.ipac.caltech.edu/),
operated by Caltech under contract with NASA. Solar System textures from
[Solar System Scope](https://www.solarsystemscope.com/textures/) (CC BY 4.0).
