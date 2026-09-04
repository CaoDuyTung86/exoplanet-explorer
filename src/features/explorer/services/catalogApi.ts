import type { ProcessedPlanet } from '../types'
import { apiBase } from './http'

/**
 * Client for our own catalog API.
 *
 * Previously the browser called the NASA TAP service directly, downloaded ~2.4 MB of
 * JSON, and then recomputed habitability scores and 3D positions for every planet in a
 * Web Worker — on every single page load.
 *
 * Now a scheduled server-side ingest does that work once and stores the result. This
 * module fetches the packed binary and rebuilds the planet list from typed-array views,
 * so there is no JSON parsing and no astronomy maths on the critical path.
 *
 * The wire format is documented in `server/app/catalog.py`; the header carries explicit
 * byte offsets so a new column on the server does not break an older client.
 */

const MAGIC = 0x4558_4f31 // "EXO1" read as big-endian
const SUPPORTED_VERSION = 1
const HEADER_SIZE = 56

/** Must stay in sync with `SIZE_CATEGORIES` in server/app/catalog.py. */
const SIZE_CATEGORIES: ProcessedPlanet['sizeCategory'][] = [
  'sub-Earth',
  'Earth-like',
  'super-Earth',
  'mini-Neptune',
  'Neptune-like',
  'gas-giant',
  'Star',
]

/** Column order of the numeric block. Must match `FLOAT_COLUMNS` on the server. */
const FLOAT_COLUMNS = [
  'distance_ly',
  'pl_rade',
  'pl_bmasse',
  'pl_eqt',
  'pl_orbper',
  'pl_orbsmax',
  'st_teff',
  'st_rad',
  'insolation',
] as const

interface CatalogMeta {
  version: number
  runId: number
  count: number
  ids: string[]
  names: string[]
  hostnames: string[]
  methodTable: string[]
  methods: number[]
  telescopeTable: string[]
  telescopes: number[]
  spectypeTable: string[]
  spectypes: number[]
}

interface CatalogHeader {
  count: number
  runId: number
  floatColumnCount: number
  offsets: {
    positions: number
    radii: number
    floats: number
    years: number
    colors: number
    habitability: number
    flags: number
    sizes: number
  }
}

export class CatalogApiError extends Error {}

function readHeader(buffer: ArrayBuffer): CatalogHeader {
  if (buffer.byteLength < HEADER_SIZE) {
    throw new CatalogApiError(`Catalog payload is truncated (${buffer.byteLength} bytes)`)
  }

  const view = new DataView(buffer)
  if (view.getUint32(0, false) !== MAGIC) {
    throw new CatalogApiError('Catalog payload is not in EXO1 format')
  }

  const version = view.getUint32(4, true)
  if (version !== SUPPORTED_VERSION) {
    throw new CatalogApiError(
      `Catalog format v${version} is newer than this client supports (v${SUPPORTED_VERSION})`
    )
  }

  return {
    count: view.getUint32(8, true),
    runId: view.getUint32(12, true),
    floatColumnCount: view.getUint32(16, true),
    offsets: {
      positions: view.getUint32(20, true),
      radii: view.getUint32(24, true),
      floats: view.getUint32(28, true),
      years: view.getUint32(32, true),
      colors: view.getUint32(36, true),
      habitability: view.getUint32(40, true),
      flags: view.getUint32(44, true),
      sizes: view.getUint32(48, true),
    },
  }
}

/** NaN is how the server encodes "NASA has no value for this". */
const orNull = (value: number): number | null => (Number.isNaN(value) ? null : value)

export function decodeCatalog(buffer: ArrayBuffer, meta: CatalogMeta): ProcessedPlanet[] {
  const header = readHeader(buffer)
  const { count, offsets } = header

  if (meta.count !== count) {
    throw new CatalogApiError(
      `Binary and metadata disagree on planet count (${count} vs ${meta.count})`
    )
  }

  // Views over the same buffer — no copying, no per-value parsing.
  const positions = new Float32Array(buffer, offsets.positions, count * 3)
  const radii = new Float32Array(buffer, offsets.radii, count)
  const floats = new Float32Array(buffer, offsets.floats, count * header.floatColumnCount)
  const years = new Uint16Array(buffer, offsets.years, count)
  const colors = new Uint8Array(buffer, offsets.colors, count * 3)
  const habitability = new Uint8Array(buffer, offsets.habitability, count)
  const flags = new Uint8Array(buffer, offsets.flags, count)
  const sizes = new Uint8Array(buffer, offsets.sizes, count)

  // The numeric block is column-major, so each column is one contiguous run.
  const column = (name: (typeof FLOAT_COLUMNS)[number]) =>
    FLOAT_COLUMNS.indexOf(name) * count

  const distanceAt = column('distance_ly')
  const radeAt = column('pl_rade')
  const masseAt = column('pl_bmasse')
  const eqtAt = column('pl_eqt')
  const orbperAt = column('pl_orbper')
  const orbsmaxAt = column('pl_orbsmax')
  const teffAt = column('st_teff')
  const stradAt = column('st_rad')

  const planets: ProcessedPlanet[] = new Array(count)

  for (let i = 0; i < count; i++) {
    const distanceLy = floats[distanceAt + i]

    planets[i] = {
      id: meta.ids[i],
      pl_name: meta.names[i],
      hostname: meta.hostnames[i],
      // The catalog stores light-years; parsecs are what the raw NASA column held.
      sy_dist: Number.isNaN(distanceLy) ? null : distanceLy / 3.26156,
      pl_rade: orNull(floats[radeAt + i]),
      pl_bmasse: orNull(floats[masseAt + i]),
      pl_eqt: orNull(floats[eqtAt + i]),
      pl_orbper: orNull(floats[orbperAt + i]),
      pl_orbsmax: orNull(floats[orbsmaxAt + i]),
      discoverymethod: meta.methodTable[meta.methods[i]] ?? '',
      disc_year: years[i] === 0 ? null : years[i],
      disc_telescope: meta.telescopeTable[meta.telescopes[i]] || null,
      st_teff: orNull(floats[teffAt + i]),
      st_rad: orNull(floats[stradAt + i]),
      st_spectype: meta.spectypeTable[meta.spectypes[i]] || null,
      // Sky coordinates are not shipped: the server already projected them, and nothing
      // in the client reads ra/dec once the position exists.
      ra: null,
      dec: null,
      distanceLy: Number.isNaN(distanceLy) ? 10 : distanceLy,
      habitabilityScore: habitability[i],
      isHabitable: (flags[i] & 1) !== 0,
      sizeCategory: SIZE_CATEGORIES[sizes[i]] ?? 'sub-Earth',
      x: positions[i * 3],
      y: positions[i * 3 + 1],
      z: positions[i * 3 + 2],
      color: [colors[i * 3] / 255, colors[i * 3 + 1] / 255, colors[i * 3 + 2] / 255],
      visualRadius: radii[i],
    }
  }

  return planets
}

export interface CatalogResult {
  planets: ProcessedPlanet[]
  runId: number
  bytes: number
}

/** Fetch and decode the catalog from our API. Throws on any failure — no silent fallback. */
export async function fetchCatalog(signal?: AbortSignal): Promise<CatalogResult> {
  const base = apiBase()

  // Ask for the version first so the heavy request can carry ?v= and be cached immutably.
  const versionRes = await fetch(`${base}/v1/version`, { signal })
  if (!versionRes.ok) {
    throw new CatalogApiError(`Catalog API returned ${versionRes.status} for /v1/version`)
  }
  const { runId } = (await versionRes.json()) as { runId: number | null }
  if (runId === null) {
    throw new CatalogApiError('Catalog is empty — the server has not ingested NASA data yet')
  }

  const query = `?v=${runId}`
  const [binaryRes, metaRes] = await Promise.all([
    fetch(`${base}/v1/catalog.bin${query}`, { signal }),
    fetch(`${base}/v1/catalog/meta${query}`, { signal }),
  ])

  if (!binaryRes.ok) {
    throw new CatalogApiError(`Catalog API returned ${binaryRes.status} for /v1/catalog.bin`)
  }
  if (!metaRes.ok) {
    throw new CatalogApiError(`Catalog API returned ${metaRes.status} for /v1/catalog/meta`)
  }

  const [buffer, meta] = await Promise.all([
    binaryRes.arrayBuffer(),
    metaRes.json() as Promise<CatalogMeta>,
  ])

  return { planets: decodeCatalog(buffer, meta), runId, bytes: buffer.byteLength }
}
