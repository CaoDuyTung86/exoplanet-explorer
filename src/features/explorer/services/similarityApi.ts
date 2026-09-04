import { apiFetch } from './http'

/**
 * "Which other world is this one like?"
 *
 * The answer is a k-nearest-neighbour search the browser has no business doing. It needs
 * the whole catalog standardised against its own population — the mean and spread of
 * radius, mass, insolation and stellar temperature across ~6,300 planets — and then a
 * spatial index over the result. The server computes the vectors once per ingest and
 * Postgres walks a GiST index straight to the nearest rows, so this endpoint returns
 * eight planets rather than the client ranking six thousand on every selection.
 *
 * The response is careful about one thing in particular: the archive is incomplete, and
 * a dimension nobody measured is imputed to the population average so it neither invents
 * a resemblance nor a difference. `measuredFields` says which numbers are real, and
 * `ratios` only ever compares two measurements.
 */

/** The four dimensions the comparison is made over. */
export type FeatureName = 'pl_rade' | 'pl_bmasse' | 'insolation' | 'st_teff'

export interface SimilarPlanet {
  id: string
  name: string
  hostname: string
  distanceLy: number | null
  habitabilityScore: number
  sizeCategory: string
  discYear: number | null
  isSolarSystem: boolean
  /** Euclidean distance in standardised feature space. This is what the ranking is. */
  distance: number
  /** A 0-100 reading of that distance, for the bar. Not a probability. */
  match: number
  /** Dimensions this planet really has a measurement for. */
  measuredFields: FeatureName[]
  values: Partial<Record<FeatureName, number | null>>
  /** Neighbour value divided by the selected planet's, where both were measured. */
  ratios: Partial<Record<FeatureName, number>>
}

export interface SimilarPlanets {
  planetId: string
  name: string
  /** False when too little was measured to place this planet in the space at all. */
  available: boolean
  dimensions: FeatureName[]
  measuredFields: FeatureName[]
  values?: Partial<Record<FeatureName, number | null>>
  neighbours: SimilarPlanet[]
}

export function fetchSimilarPlanets(
  planetId: string,
  limit = 6,
  signal?: AbortSignal
): Promise<SimilarPlanets> {
  return apiFetch<SimilarPlanets>(
    `/v1/planets/${encodeURIComponent(planetId)}/similar?limit=${limit}`,
    { signal }
  )
}
