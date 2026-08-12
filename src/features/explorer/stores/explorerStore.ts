import { create } from 'zustand'
import { type ProcessedPlanet, type FilterState, DEFAULT_FILTERS } from '../types'

interface ExplorerState {
  // Data
  planets: ProcessedPlanet[]
  filteredPlanets: ProcessedPlanet[]
  selectedPlanet: ProcessedPlanet | null
  hoveredPlanetId: string | null

  // Filters
  filters: FilterState

  // UI
  isLoading: boolean
  sidebarOpen: boolean
  viewMode: '3d' | 'table'
  simulationSpeed: number
  isFlyingTo?: boolean
  showComparison: boolean
  showScientificOverlays: boolean

  flightTrigger: number
  cameraResetTrigger: number

  // Actions
  setShowComparison: (show: boolean) => void
  setShowScientificOverlays: (show: boolean) => void
  setPlanets: (planets: ProcessedPlanet[]) => void
  setSelectedPlanet: (planet: ProcessedPlanet | null) => void
  setHoveredPlanetId: (id: string | null) => void
  setFilters: (filters: Partial<FilterState>) => void
  resetFilters: () => void
  setLoading: (loading: boolean) => void
  setSidebarOpen: (open: boolean) => void
  setViewMode: (mode: '3d' | 'table') => void
  setSimulationSpeed: (speed: number) => void
  triggerCameraReset: () => void
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
  viewMode: '3d',
  simulationSpeed: 1.0,
  showComparison: false,
  showScientificOverlays: false,
  flightTrigger: 0,
  cameraResetTrigger: 0,

  setPlanets: (planets) => {
    const filtered = applyFilters(planets, get().filters)
    set({ planets, filteredPlanets: filtered, isLoading: false })
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
    set({ filters: newFilters, filteredPlanets: filtered })
  },

  resetFilters: () => {
    const filtered = applyFilters(get().planets, DEFAULT_FILTERS)
    set({ filters: DEFAULT_FILTERS, filteredPlanets: filtered })
  },

  setLoading: (loading) => set({ isLoading: loading }),
  setSidebarOpen: (open) => set({ sidebarOpen: open }),
  setViewMode: (mode) => set({ viewMode: mode }),
  setSimulationSpeed: (speed) => set({ simulationSpeed: speed }),
  setShowComparison: (show) => set({ showComparison: show }),
  setShowScientificOverlays: (show) => set({ showScientificOverlays: show }),
  triggerCameraReset: () => set((state) => ({ cameraResetTrigger: state.cameraResetTrigger + 1 })),
}))
