import { create } from 'zustand'
import { type ProcessedPlanet, type FilterState, DEFAULT_FILTERS } from '../types'

/** Range the time machine scrubs across. Clamped to what the catalog actually holds. */
export interface TimelineRange {
  minYear: number
  maxYear: number
}

interface ExplorerState {
  // Data
  planets: ProcessedPlanet[]
  filteredPlanets: ProcessedPlanet[]
  selectedPlanet: ProcessedPlanet | null
  hoveredPlanetId: string | null

  // Filters
  filters: FilterState

  // Time machine — replays the sky filling up, 1992 to now.
  //
  // Deliberately kept out of `filters`. A filter answers "which planets do I care
  // about"; the timeline answers "which of those were known yet", and folding it into
  // `applyFilters` would rescan all 6,287 planets on every animation step. Instead
  // `timelineOrder` sorts the filtered set by discovery year once, so a step is a binary
  // search and a slice.
  timelineEnabled: boolean
  timelineYear: number
  timelinePlaying: boolean
  /** Years per second during playback. */
  timelineSpeed: number
  timelineRange: TimelineRange
  /** `filteredPlanets`, ascending by discovery year. Solar System bodies excluded. */
  timelineOrder: ProcessedPlanet[]

  // UI
  isLoading: boolean
  sidebarOpen: boolean
  /**
   * The find-a-planet palette. It lives here rather than inside the component because
   * two different things open it — Ctrl/Cmd+K anywhere, and the button in the header —
   * and a shared flag is smaller than an event bus between them.
   */
  searchOpen: boolean
  viewMode: '3d' | 'table'
  simulationSpeed: number
  isFlyingTo?: boolean
  showComparison: boolean
  showScientificOverlays: boolean

  flightTrigger: number
  cameraResetTrigger: number
  introCompleted: boolean

  // Actions
  setShowComparison: (show: boolean) => void
  setShowScientificOverlays: (show: boolean) => void
  setIntroCompleted: (completed: boolean) => void
  setPlanets: (planets: ProcessedPlanet[]) => void
  setSelectedPlanet: (planet: ProcessedPlanet | null) => void
  setHoveredPlanetId: (id: string | null) => void
  setFilters: (filters: Partial<FilterState>) => void
  resetFilters: () => void
  setLoading: (loading: boolean) => void
  setSidebarOpen: (open: boolean) => void
  setSearchOpen: (open: boolean) => void
  setViewMode: (mode: '3d' | 'table') => void
  setSimulationSpeed: (speed: number) => void
  triggerCameraReset: () => void

  setTimelineEnabled: (enabled: boolean) => void
  setTimelineYear: (year: number) => void
  setTimelinePlaying: (playing: boolean) => void
  setTimelineSpeed: (speed: number) => void
  setTimelineRange: (range: TimelineRange) => void
}

/** Planets with no recorded discovery year surface in the final year rather than never. */
const discoveryYear = (p: ProcessedPlanet, maxYear: number): number =>
  p.disc_year ?? maxYear

/**
 * The Solar System is the scene's reference frame, not a discovery. It is rendered by
 * `SolarSystemPlanets`, bypasses `applyFilters` for the same reason, and is likewise
 * exempt from the timeline — 1992 should not be an empty void with no Earth in it.
 */
const isSolarSystem = (p: ProcessedPlanet): boolean => p.id.startsWith('sol-')

function buildTimelineOrder(
  planets: ProcessedPlanet[],
  range: TimelineRange
): ProcessedPlanet[] {
  return planets
    .filter((p) => !isSolarSystem(p))
    .sort((a, b) => discoveryYear(a, range.maxYear) - discoveryYear(b, range.maxYear))
}

/**
 * Index of the first planet discovered after `year` — i.e. the length of the prefix that
 * was already known. Binary search rather than a scan, because this runs on every frame
 * of playback.
 */
export function knownCountByYear(
  order: ProcessedPlanet[],
  year: number,
  maxYear: number
): number {
  let low = 0
  let high = order.length
  while (low < high) {
    const mid = (low + high) >>> 1
    if (discoveryYear(order[mid], maxYear) <= year) low = mid + 1
    else high = mid
  }
  return low
}

function applyFilters(planets: ProcessedPlanet[], filters: FilterState): ProcessedPlanet[] {
  return planets.filter((p) => {
    // Search query
    if (filters.searchQuery) {
      const q = filters.searchQuery.toLowerCase()
      if (!p.pl_name.toLowerCase().includes(q) && !p.hostname.toLowerCase().includes(q)) {
        return false
      }
    }

    // Bypass range filters for Solar System planets (keep them visible for context)
    if (p.id.startsWith('sol-')) return true

    // Radius range
    if (p.pl_rade !== null) {
      if (p.pl_rade < filters.radiusRange[0] || p.pl_rade > filters.radiusRange[1]) return false
    }

    // Mass range
    if (p.pl_bmasse !== null) {
      if (p.pl_bmasse < filters.massRange[0] || p.pl_bmasse > filters.massRange[1]) return false
    }

    // Temperature range
    if (p.pl_eqt !== null) {
      if (p.pl_eqt < filters.tempRange[0] || p.pl_eqt > filters.tempRange[1]) return false
    }

    // Distance range
    if (p.distanceLy !== null) {
      if (p.distanceLy < filters.distanceRange[0] || p.distanceLy > filters.distanceRange[1]) return false
    }

    // Habitability
    if (filters.showHabitableOnly && !p.isHabitable) return false

    // Discovery methods
    if (filters.discoveryMethods.length > 0) {
      if (!filters.discoveryMethods.includes(p.discoverymethod)) return false
    }

    // Orbital Period range (days)
    if (p.pl_orbper !== null) {
      if (p.pl_orbper < filters.orbitalPeriodRange[0] || p.pl_orbper > filters.orbitalPeriodRange[1]) return false
    }

    // Spectral type filtering
    if (filters.spectralTypes.length > 0) {
      // If planet has no known spectral type, or spectral type isn't in selected list
      if (!p.st_spectype) return false
      // Match the first character of st_spectype (e.g. 'G' in 'G2V') against selected spectral types
      const starClass = p.st_spectype.charAt(0).toUpperCase()
      if (!filters.spectralTypes.includes(starClass)) return false
    }

    // Year range
    if (p.disc_year !== null) {
      if (p.disc_year < filters.yearRange[0] || p.disc_year > filters.yearRange[1]) return false
    }

    return true
  })
}

export const useExplorerStore = create<ExplorerState>((set, get) => ({
  planets: [],
  filteredPlanets: [],
  selectedPlanet: null,
  hoveredPlanetId: null,
  filters: DEFAULT_FILTERS,
  isLoading: true,
  sidebarOpen: true,
  searchOpen: false,
  viewMode: '3d',
  simulationSpeed: 1.0,
  showComparison: false,
  showScientificOverlays: false,
  flightTrigger: 0,
  cameraResetTrigger: 0,
  introCompleted: false,

  timelineEnabled: false,
  // Seeded from DEFAULT_FILTERS so the scrubber has a sane range before /v1/timeline
  // answers; `setTimelineRange` narrows it to what the catalog really contains.
  timelineRange: { minYear: DEFAULT_FILTERS.yearRange[0], maxYear: DEFAULT_FILTERS.yearRange[1] },
  timelineYear: DEFAULT_FILTERS.yearRange[1],
  timelinePlaying: false,
  timelineSpeed: 2.5,
  timelineOrder: [],

  setPlanets: (planets) => {
    const filtered = applyFilters(planets, get().filters)
    set({
      planets,
      filteredPlanets: filtered,
      timelineOrder: buildTimelineOrder(filtered, get().timelineRange),
      isLoading: false,
    })
  },
  setSelectedPlanet: (planet) => {
    set({
      selectedPlanet: planet,
      hoveredPlanetId: planet ? planet.id : null,
      flightTrigger: planet ? Date.now() : 0,
    })
  },
  setHoveredPlanetId: (id) => set({ hoveredPlanetId: id }),

  setFilters: (partial) => {
    const newFilters = { ...get().filters, ...partial }
    const filtered = applyFilters(get().planets, newFilters)
    set({
      filters: newFilters,
      filteredPlanets: filtered,
      timelineOrder: buildTimelineOrder(filtered, get().timelineRange),
    })
  },

  resetFilters: () => {
    const filtered = applyFilters(get().planets, DEFAULT_FILTERS)
    set({
      filters: DEFAULT_FILTERS,
      filteredPlanets: filtered,
      timelineOrder: buildTimelineOrder(filtered, get().timelineRange),
    })
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setSearchOpen: (open) => set({ searchOpen: open }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),
  setShowComparison: (show) => set({ showComparison: show }),
  setShowScientificOverlays: (show) => set({ showScientificOverlays: show }),
  setIntroCompleted: (completed) => set({ introCompleted: completed }),
  triggerCameraReset: () => set((state) => ({ cameraResetTrigger: state.cameraResetTrigger + 1 })),

  setTimelineEnabled: (enabled) => {
    const { timelineRange } = get()
    set({
      timelineEnabled: enabled,
      // Turning it off stops playback too, otherwise the year keeps advancing invisibly
      // and re-enabling drops the visitor somewhere they did not leave off.
      timelinePlaying: false,
      // Entering the time machine starts at the beginning; leaving restores the full sky.
      timelineYear: enabled ? timelineRange.minYear : timelineRange.maxYear,
    })
  },

  setTimelineYear: (year) => {
    const { minYear, maxYear } = get().timelineRange
    set({ timelineYear: Math.min(maxYear, Math.max(minYear, Math.round(year))) })
  },

  setTimelinePlaying: (playing) => {
    const { timelineYear, timelineRange } = get()
    // Pressing play at the end replays from the start rather than doing nothing.
    const restart = playing && timelineYear >= timelineRange.maxYear
    set({
      timelinePlaying: playing,
      timelineYear: restart ? timelineRange.minYear : timelineYear,
    })
  },

  setTimelineSpeed: (speed) => set({ timelineSpeed: speed }),

  setTimelineRange: (range) => {
    const { timelineEnabled, timelineYear, filteredPlanets } = get()
    set({
      timelineRange: range,
      // The unknown-year planets sort to `maxYear`, so a changed range reorders them.
      timelineOrder: buildTimelineOrder(filteredPlanets, range),
      timelineYear: timelineEnabled
        ? Math.min(range.maxYear, Math.max(range.minYear, timelineYear))
        : range.maxYear,
    })
  },
}))
