import type { ProcessedPlanet } from '../types'
import { apiBase } from './http'

/**
 * Finding a planet by a name you half-remember.
 *
 * The browser already holds all ~6,300 names, so this is not here to do substring
 * matching — that is a `filter()` away and the sidebar already does it. It is here for
 * the two things a `filter()` cannot do:
 *
 * *Punctuation.* `Kepler-452 b` is typed as `kepler 452b`, `kepler452b`, `Kepler 452 B`.
 * Both sides are folded to lowercase alphanumerics before anything is compared, so the
 * hyphen and the spaces simply stop existing.
 *
 * *Typos.* `keplr-452 b` matches nothing literal, anywhere. The server ranks those with
 * a trigram index, and caps what a fuzzy match can score so it never displaces something
 * the visitor actually typed.
 *
 * If the API is unreachable — the app still runs against NASA directly — `localSearch`
 * takes over. It reproduces the fold and the scoring bands exactly, minus the trigram
 * fallback, which cannot exist in the client: it needs the index. So offline the typo
 * tolerance is the one thing that goes, and the caller says so rather than quietly
 * returning a worse list.
 */

export type MatchedOn = 'name' | 'host'

export interface SearchResult {
  id: string
  name: string
  hostname: string
  /** 0-1. Exact 1.0 · prefix 0.80-0.95 · contained 0.60-0.75 · typo below 0.55. */
  score: number
  /** Whether the planet's own name matched, or its host star's. */
  matchedOn: MatchedOn
  distanceLy: number | null
  habitabilityScore: number | null
  isHabitable: boolean | null
  sizeCategory: string | null
  discYear: number | null
  discoveryMethod: string | null
  isSolarSystem: boolean | null
}

export interface SearchResponse {
  query: string
  /** The folded form actually matched against. Useful when a result looks surprising. */
  normalized: string
  count: number
  results: SearchResult[]
  /** Present when the query was too short to run; `results` is then empty by design. */
  minQueryLength?: number
}

/** Mirrors `[^a-zA-Z0-9]+` in `app/search.py` and in the generated columns in SQL. */
export function normalizeQuery(text: string): string {
  return text.replace(/[^a-zA-Z0-9]+/g, '').toLowerCase()
}

export const MIN_QUERY_LENGTH = 2

export async function searchPlanets(
  query: string,
  limit = 8,
  signal?: AbortSignal
): Promise<SearchResponse> {
  const url = `${apiBase()}/v1/search?q=${encodeURIComponent(query)}&limit=${limit}`
  const response = await fetch(url, { signal })

  if (!response.ok) throw new Error(`search failed with ${response.status}`)

  return (await response.json()) as SearchResponse
}

/** The literal half of `field_score` in `app/search.py`, with the same bands. */
function fieldScore(query: string, key: string): number {
  if (!key || !query) return 0
  if (key === query) return 1

  const coverage = query.length / key.length
  if (key.startsWith(query)) return 0.8 + 0.15 * coverage
  if (key.includes(query)) return 0.6 + 0.15 * coverage
  return 0
}

/**
 * Offline fallback: the same ranking over the catalog already in memory.
 *
 * Everything the server does survives here except the trigram arm, so a typo finds
 * nothing. That is a real difference in what the visitor gets, which is why the caller
 * labels this mode instead of presenting it as the same search.
 */
export function localSearch(
  planets: ProcessedPlanet[],
  query: string,
  limit = 8
): SearchResult[] {
  const normalized = normalizeQuery(query)
  if (normalized.length < MIN_QUERY_LENGTH) return []

  const results: SearchResult[] = []

  for (const planet of planets) {
    const nameScore = fieldScore(normalized, normalizeQuery(planet.pl_name))
    const hostScore = fieldScore(normalized, normalizeQuery(planet.hostname)) * 0.95
    const score = Math.max(nameScore, hostScore)
    if (score <= 0) continue

    results.push({
      id: planet.id,
      name: planet.pl_name,
      hostname: planet.hostname,
      score: Math.round(score * 1000) / 1000,
      matchedOn: hostScore > nameScore ? 'host' : 'name',
      distanceLy: planet.distanceLy,
      habitabilityScore: planet.habitabilityScore,
      isHabitable: planet.isHabitable,
      sizeCategory: planet.sizeCategory,
      discYear: planet.disc_year,
      discoveryMethod: planet.discoverymethod,
      isSolarSystem: planet.id.startsWith('sol-'),
    })
  }

  results.sort(
    (a, b) =>
      b.score - a.score ||
      (a.distanceLy ?? Infinity) - (b.distanceLy ?? Infinity) ||
      a.name.localeCompare(b.name)
  )

  return results.slice(0, limit)
}
