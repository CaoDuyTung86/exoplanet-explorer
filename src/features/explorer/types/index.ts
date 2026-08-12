/** Core Exoplanet data shape from NASA TAP API (pscomppars table) */
export interface Exoplanet {
  pl_name: string           // Planet name (e.g., "Kepler-442 b")
  hostname: string          // Host star name
  sy_dist: number | null    // Distance from Earth (parsecs)
  pl_rade: number | null    // Planet radius (Earth radii)
  pl_bmasse: number | null  // Planet mass (Earth masses)
  pl_eqt: number | null     // Equilibrium temperature (K)
  pl_orbper: number | null  // Orbital period (days)
  pl_orbsmax: number | null // Semi-major axis (AU)
  discoverymethod: string   // Discovery method
  disc_year: number | null  // Discovery year
  disc_telescope: string | null // Telescope name
  st_teff: number | null    // Stellar effective temperature (K)
  st_rad: number | null     // Stellar radius (Solar radii)
  st_spectype: string | null // Spectral type (e.g., "G2V", "K1V")
  ra: number | null         // Right ascension (degrees)
  dec: number | null        // Declination (degrees)
}

/** Processed planet with computed fields for visualization */
export interface ProcessedPlanet extends Exoplanet {
  id: string
  distanceLy: number       // Distance in light-years
  habitabilityScore: number // 0-100 habitability assessment
  isHabitable: boolean     // In habitable zone?
  sizeCategory: 'sub-Earth' | 'Earth-like' | 'super-Earth' | 'mini-Neptune' | 'Neptune-like' | 'gas-giant' | 'Star'
  // 3D positioning (spherical → cartesian)
  x: number
  y: number
  z: number
  // Visual properties
  color: [number, number, number]
  visualRadius: number
}

export interface FilterState {
  searchQuery: string
  radiusRange: [number, number]     // Earth radii
  massRange: [number, number]       // Earth masses
  tempRange: [number, number]       // Kelvin
  distanceRange: [number, number]   // Light-years
  orbitalPeriodRange: [number, number] // Days
  discoveryMethods: string[]
  spectralTypes: string[]           // e.g. 'O', 'B', 'A', 'F', 'G', 'K', 'M'
  yearRange: [number, number]
  showHabitableOnly: boolean
}

export const DEFAULT_FILTERS: FilterState = {
  searchQuery: '',
  radiusRange: [0, 30],
  massRange: [0, 10000],
  tempRange: [0, 5000],
  distanceRange: [0, 10000],
  orbitalPeriodRange: [0, 10000],
  discoveryMethods: [],
  spectralTypes: [],
  yearRange: [1992, 2026],
  showHabitableOnly: false,
}

export const DISCOVERY_METHODS = [
  'Transit',
  'Radial Velocity',
  'Direct Imaging',
  'Microlensing',
  'Transit Timing Variations',
  'Eclipse Timing Variations',
  'Pulsar Timing',
  'Astrometry',
  'Disk Kinematics',
  'Orbital Brightness Modulation',
] as const
