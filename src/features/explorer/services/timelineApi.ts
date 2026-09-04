import { apiBase, apiFetch } from './http'

/**
 * The two time-machine endpoints.
 *
 * `/v1/timeline` is the sky filling up: how many planets were known at the end of each
 * year, which method dominated, and the year's most habitable find. It is anonymous and
 * cacheable, so it uses plain `fetch` like the rest of the catalog.
 *
 * `/v1/planets/{id}/history` is the part NASA cannot serve. The archive only returns the
 * present, so when a radius is refined the old number is gone from their side. Our
 * ingest keeps whatever it overwrote, which makes the revisions replayable here.
 */

export interface TimelineYear {
  year: number
  /** Planets discovered in this year alone. */
  count: number
  /** Planets known by the end of this year. */
  cumulative: number
  habitable: number
  cumulativeHabitable: number
  topMethod: string | null
  notable?: {
    id: string
    name: string
    habitabilityScore: number
  }
}

export interface Timeline {
  minYear: number | null
  maxYear: number | null
  total: number
  years: TimelineYear[]
}

export type RevisionValue = number | string | null

export interface RevisionChange {
  field: string
  from: RevisionValue
  to: RevisionValue
}

export interface Revision {
  runId: number
  /** ISO-8601 — when our ingest noticed, not when the paper was published. */
  changedAt: string
  changes: RevisionChange[]
}

export interface PlanetHistory {
  planetId: string
  name: string
  discoveryYear: number | null
  firstSeenRun: number | null
  /** How many ingests touched a tracked field, including ones with nothing to display. */
  recordedRuns: number
  revisions: Revision[]
}

export async function fetchTimeline(signal?: AbortSignal): Promise<Timeline> {
  const response = await fetch(`${apiBase()}/v1/timeline`, { signal })
  if (!response.ok) {
    throw new Error(`Timeline API returned ${response.status}`)
  }
  return (await response.json()) as Timeline
}

export function fetchPlanetHistory(
  planetId: string,
  signal?: AbortSignal
): Promise<PlanetHistory> {
  return apiFetch<PlanetHistory>(
    `/v1/planets/${encodeURIComponent(planetId)}/history`,
    { signal }
  )
}
