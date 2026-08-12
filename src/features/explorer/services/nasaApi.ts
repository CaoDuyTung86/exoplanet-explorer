import type { Exoplanet, ProcessedPlanet } from '../types'

const DIRECT_URL = 'https://exoplanetarchive.ipac.caltech.edu/TAP/sync'
const QUERY = `SELECT pl_name, hostname, sy_dist, pl_rade, pl_bmasse, pl_eqt, pl_orbper, pl_orbsmax, discoverymethod, disc_year, disc_telescope, st_teff, st_rad, st_spectype, ra, dec FROM pscomppars WHERE pl_rade IS NOT NULL AND sy_dist IS NOT NULL ORDER BY sy_dist ASC`

/** Solar System planets positioned around Origin [0,0,0] */
export const SOLAR_SYSTEM_PLANETS: ProcessedPlanet[] = [
  {
    id: 'sol-sun',
    pl_name: 'The Sun (Sol)',
    hostname: 'Sol',
    sy_dist: 0,
    pl_rade: 109.2,
    pl_bmasse: 333000,
    pl_eqt: 5778,
    pl_orbper: 0,
    pl_orbsmax: 0,
    discoverymethod: 'Naked Eye (Origin)',
    disc_year: 0,
    disc_telescope: 'Solar System Center',
    st_teff: 5778,
    st_rad: 1.0,
    st_spectype: 'G2V',
    ra: 0, dec: 0, distanceLy: 0,
    habitabilityScore: 0, isHabitable: false, sizeCategory: 'Star',
    x: 0, y: 0, z: 0,
    color: [1.0, 0.85, 0.2], // Sun golden yellow
    visualRadius: 1.5,
  },
  {
    id: 'sol-mercury',
    pl_name: 'Mercury',
    hostname: 'Sol',
    sy_dist: 0.000006,
    pl_rade: 0.38, pl_bmasse: 0.055, pl_eqt: 440, pl_orbper: 88, pl_orbsmax: 0.39,
    discoverymethod: 'Naked Eye', disc_year: 0, disc_telescope: 'Ancient Astronomy',
    st_teff: 5778, st_rad: 1.0, st_spectype: 'G2V', ra: 0, dec: 0, distanceLy: 0.000006,
    habitabilityScore: 0, isHabitable: false, sizeCategory: 'sub-Earth',
    x: 2.4, y: 0, z: 0,
    color: [0.65, 0.65, 0.7], // Slate Gray
    visualRadius: 0.35,
  },
  {
    id: 'sol-venus',
    pl_name: 'Venus',
    hostname: 'Sol',
    sy_dist: 0.000011,
    pl_rade: 0.95, pl_bmasse: 0.815, pl_eqt: 737, pl_orbper: 224.7, pl_orbsmax: 0.72,
    discoverymethod: 'Naked Eye', disc_year: 0, disc_telescope: 'Ancient Astronomy',
    st_teff: 5778, st_rad: 1.0, st_spectype: 'G2V', ra: 0, dec: 0, distanceLy: 0.000011,
    habitabilityScore: 5, isHabitable: false, sizeCategory: 'Earth-like',
    x: 3.2, y: 0, z: 0,
    color: [0.95, 0.75, 0.3], // Golden Atmosphere
    visualRadius: 0.55,
  },
  {
    id: 'sol-earth',
    pl_name: 'Earth (Home)',
    hostname: 'Sol',
    sy_dist: 0.0000158,
    pl_rade: 1.0, pl_bmasse: 1.0, pl_eqt: 255, pl_orbper: 365.25, pl_orbsmax: 1.0,
    discoverymethod: 'Home Planet', disc_year: 0, disc_telescope: 'Human Cradle',
    st_teff: 5778, st_rad: 1.0, st_spectype: 'G2V', ra: 0, dec: 0, distanceLy: 0.0000158,
    habitabilityScore: 100, isHabitable: true, sizeCategory: 'Earth-like',
    x: 4.3, y: 0, z: 0,
    color: [0.2, 0.6, 1.0], // Blue Marble Earth
    visualRadius: 0.6,
  },
  {
    id: 'sol-mars',
    pl_name: 'Mars',
    hostname: 'Sol',
    sy_dist: 0.000024,
    pl_rade: 0.53, pl_bmasse: 0.11, pl_eqt: 210, pl_orbper: 687, pl_orbsmax: 1.52,
    discoverymethod: 'Naked Eye', disc_year: 0, disc_telescope: 'Ancient Astronomy',
    st_teff: 5778, st_rad: 1.0, st_spectype: 'G2V', ra: 0, dec: 0, distanceLy: 0.000024,
    habitabilityScore: 35, isHabitable: false, sizeCategory: 'sub-Earth',
    x: 5.6, y: 0, z: 0,
    color: [0.95, 0.35, 0.2], // Red planet
    visualRadius: 0.45,
  },
  {
    id: 'sol-jupiter',
    pl_name: 'Jupiter',
    hostname: 'Sol',
    sy_dist: 0.000082,
    pl_rade: 11.2, pl_bmasse: 317.8, pl_eqt: 110, pl_orbper: 4332, pl_orbsmax: 5.2,
    discoverymethod: 'Naked Eye', disc_year: 0, disc_telescope: 'Galileo 1610',
    st_teff: 5778, st_rad: 1.0, st_spectype: 'G2V', ra: 0, dec: 0, distanceLy: 0.000082,
    habitabilityScore: 0, isHabitable: false, sizeCategory: 'gas-giant',
    x: 8.5, y: 0, z: 0,
    color: [0.85, 0.55, 0.3], // Gas Giant Amber
    visualRadius: 0.95,
  },
  {
    id: 'sol-saturn',
    pl_name: 'Saturn',
    hostname: 'Sol',
    sy_dist: 0.00015,
    pl_rade: 9.45, pl_bmasse: 95.2, pl_eqt: 81, pl_orbper: 10759, pl_orbsmax: 9.5,
    discoverymethod: 'Naked Eye', disc_year: 0, disc_telescope: 'Galileo 1610',
    st_teff: 5778, st_rad: 1.0, st_spectype: 'G2V', ra: 0, dec: 0, distanceLy: 0.00015,
    habitabilityScore: 0, isHabitable: false, sizeCategory: 'gas-giant',
    x: 12.0, y: 0, z: 0,
    color: [0.95, 0.85, 0.5], // Saturn Gold
    visualRadius: 0.85,
  },
  {
    id: 'sol-uranus',
    pl_name: 'Uranus',
    hostname: 'Sol',
    sy_dist: 0.00030,
    pl_rade: 4.0, pl_bmasse: 14.5, pl_eqt: 58, pl_orbper: 30687, pl_orbsmax: 19.2,
    discoverymethod: 'Telescope', disc_year: 1781, disc_telescope: 'William Herschel',
    st_teff: 5778, st_rad: 1.0, st_spectype: 'G2V', ra: 0, dec: 0, distanceLy: 0.00030,
    habitabilityScore: 0, isHabitable: false, sizeCategory: 'Neptune-like',
    x: 15.5, y: 0, z: 0,
    color: [0.3, 0.85, 0.9], // Cyan Ice Giant
    visualRadius: 0.7,
  },
  {
    id: 'sol-neptune',
    pl_name: 'Neptune',
    hostname: 'Sol',
    sy_dist: 0.00047,
    pl_rade: 3.88, pl_bmasse: 17.1, pl_eqt: 46, pl_orbper: 60190, pl_orbsmax: 30.1,
    discoverymethod: 'Mathematical Prediction', disc_year: 1846, disc_telescope: 'Johann Galle',
    st_teff: 5778, st_rad: 1.0, st_spectype: 'G2V', ra: 0, dec: 0, distanceLy: 0.00047,
    habitabilityScore: 0, isHabitable: false, sizeCategory: 'Neptune-like',
    x: 18.5, y: 0, z: 0,
    color: [0.2, 0.4, 0.9], // Deep Azure Blue
    visualRadius: 0.68,
  },
]

/** Curated backup dataset of famous exoplanets */
const CURATED_FAMOUS_EXOPLANETS: Exoplanet[] = [
  {
    pl_name: 'Proxima Centauri b',
    hostname: 'Proxima Centauri',
    sy_dist: 1.30,
    pl_rade: 1.07,
    pl_bmasse: 1.17,
    pl_eqt: 234,
    pl_orbper: 11.18,
    pl_orbsmax: 0.0485,
    discoverymethod: 'Radial Velocity',
    disc_year: 2016,
    disc_telescope: 'HARPS / ESO 3.6m',
    st_teff: 3042,
    st_rad: 0.14,
    st_spectype: 'M5.5V',
    ra: 217.42,
    dec: -62.68,
  },
  {
    pl_name: 'TRAPPIST-1 e',
    hostname: 'TRAPPIST-1',
    sy_dist: 12.43,
    pl_rade: 0.92,
    pl_bmasse: 0.69,
    pl_eqt: 251,
    pl_orbper: 6.10,
    pl_orbsmax: 0.029,
    discoverymethod: 'Transit',
    disc_year: 2017,
    disc_telescope: 'Spitzer Space Telescope',
    st_teff: 2566,
    st_rad: 0.12,
    st_spectype: 'M8V',
    ra: 346.62,
    dec: -5.04,
  },
  {
    pl_name: 'Kepler-452 b',
    hostname: 'Kepler-452',
    sy_dist: 550.0,
    pl_rade: 1.63,
    pl_bmasse: 5.0,
    pl_eqt: 265,
    pl_orbper: 384.84,
    pl_orbsmax: 1.046,
    discoverymethod: 'Transit',
    disc_year: 2015,
    disc_telescope: 'Kepler Space Telescope',
    st_teff: 5757,
    st_rad: 1.11,
    st_spectype: 'G2V',
    ra: 296.0,
    dec: 44.27,
  },
  {
    pl_name: 'K2-18 b',
    hostname: 'K2-18',
    sy_dist: 38.0,
    pl_rade: 2.61,
    pl_bmasse: 8.63,
    pl_eqt: 260,
    pl_orbper: 32.94,
    pl_orbsmax: 0.143,
    discoverymethod: 'Transit',
    disc_year: 2015,
    disc_telescope: 'Kepler / JWST',
    st_teff: 3457,
    st_rad: 0.41,
    st_spectype: 'M3.5V',
    ra: 172.56,
    dec: 7.59,
  },
  {
    pl_name: 'Kepler-186 f',
    hostname: 'Kepler-186',
    sy_dist: 178.5,
    pl_rade: 1.17,
    pl_bmasse: 1.71,
    pl_eqt: 188,
    pl_orbper: 129.94,
    pl_orbsmax: 0.432,
    discoverymethod: 'Transit',
    disc_year: 2014,
    disc_telescope: 'Kepler Space Telescope',
    st_teff: 3788,
    st_rad: 0.52,
    st_spectype: 'M1V',
    ra: 298.65,
    dec: 43.95,
  },
  {
    pl_name: 'TOI-700 d',
    hostname: 'TOI-700',
    sy_dist: 31.1,
    pl_rade: 1.14,
    pl_bmasse: 1.72,
    pl_eqt: 269,
    pl_orbper: 37.42,
    pl_orbsmax: 0.163,
    discoverymethod: 'Transit',
    disc_year: 2020,
    disc_telescope: 'TESS Space Telescope',
    st_teff: 3480,
    st_rad: 0.42,
    st_spectype: 'M2V',
    ra: 97.10,
    dec: -65.58,
  },
  {
    pl_name: 'LHS 1140 b',
    hostname: 'LHS 1140',
    sy_dist: 14.99,
    pl_rade: 1.73,
    pl_bmasse: 5.60,
    pl_eqt: 235,
    pl_orbper: 24.74,
    pl_orbsmax: 0.0936,
    discoverymethod: 'Transit',
    disc_year: 2017,
    disc_telescope: 'MEarth Project / JWST',
    st_teff: 3216,
    st_rad: 0.21,
    st_spectype: 'M4.5V',
    ra: 12.74,
    dec: -15.23,
  },
]

const PROXY_URL = '/api/nasa/TAP/sync'
const CORS_PROXY_URL = 'https://corsproxy.io/?' + encodeURIComponent(DIRECT_URL)

let cachedFetchPromise: Promise<Exoplanet[]> | null = null

/** Fetch exoplanets from NASA TAP API with Solar System included */
export function fetchExoplanets(): Promise<Exoplanet[]> {
  if (!cachedFetchPromise) {
    cachedFetchPromise = doFetchExoplanets().catch((err) => {
      cachedFetchPromise = null
      throw err
    })
  }
  return cachedFetchPromise
}

async function doFetchExoplanets(): Promise<Exoplanet[]> {
  const queryParam = `?query=${encodeURIComponent(QUERY)}&format=json`

  // 1. Try local Vite proxy first (for dev)
  try {
    console.log('Fetching from NASA TAP API via local proxy...')
    const res = await fetch(PROXY_URL + queryParam, { signal: AbortSignal.timeout(30000) })
    if (res.ok) {
      const data: Exoplanet[] = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        console.log(`Successfully fetched ${data.length} planets from NASA via local proxy.`)
        return data
      }
    }
  } catch (error) {
    console.warn('Local proxy failed, trying public CORS proxy...', error)
  }

  // 2. Try public CORS proxy (for production preview / Vercel without backend)
  try {
    const res = await fetch(CORS_PROXY_URL + queryParam, { signal: AbortSignal.timeout(30000) })
    if (res.ok) {
      const data: Exoplanet[] = await res.json()
      if (Array.isArray(data) && data.length > 0) {
        console.log(`Successfully fetched ${data.length} planets from NASA via CORS proxy.`)
        return data
      }
    }
  } catch (error) {
    console.error('CORS proxy also failed:', error)
  }

  console.warn('All NASA API endpoints failed. Loading curated backup dataset.')
  return CURATED_FAMOUS_EXOPLANETS
}

function parsecsToLightYears(pc: number): number {
  return pc * 3.26156
}

function calculateHabitability(planet: Exoplanet): number {
  let score = 0

  if (planet.pl_eqt !== null && planet.pl_eqt >= 180 && planet.pl_eqt <= 310) {
    score += 30
  } else if (planet.pl_eqt !== null && planet.pl_eqt >= 150 && planet.pl_eqt <= 350) {
    score += 15
  }

  if (planet.pl_rade !== null) {
    if (planet.pl_rade >= 0.8 && planet.pl_rade <= 1.5) {
      score += 25
    } else if (planet.pl_rade >= 0.5 && planet.pl_rade <= 2.0) {
      score += 15
    } else if (planet.pl_rade >= 2.0 && planet.pl_rade <= 4.0) {
      score += 5
    }
  }

  if (planet.pl_bmasse !== null) {
    if (planet.pl_bmasse >= 0.5 && planet.pl_bmasse <= 5.0) {
      score += 25
    } else if (planet.pl_bmasse >= 0.1 && planet.pl_bmasse <= 10.0) {
      score += 12
    }
  }

  if (planet.st_spectype) {
    const stype = planet.st_spectype.charAt(0).toUpperCase()
    if (stype === 'G') score += 20
    else if (stype === 'K') score += 18
    else if (stype === 'F') score += 10
    else if (stype === 'M') score += 8
  } else if (planet.st_teff !== null) {
    if (planet.st_teff >= 4500 && planet.st_teff <= 6500) score += 15
    else if (planet.st_teff >= 3500 && planet.st_teff <= 7500) score += 8
  }

  return Math.min(100, score)
}

function categorizePlanet(radiusEarth: number | null): ProcessedPlanet['sizeCategory'] {
  if (radiusEarth === null || radiusEarth < 0.8) return 'sub-Earth'
  if (radiusEarth <= 1.5) return 'Earth-like'
  if (radiusEarth <= 2.5) return 'super-Earth'
  if (radiusEarth <= 4.0) return 'mini-Neptune'
  if (radiusEarth <= 8.0) return 'Neptune-like'
  return 'gas-giant'
}

function getPlanetColor(temp: number | null, habitScore: number): [number, number, number] {
  if (habitScore >= 60) return [0.2, 0.8, 0.5]
  if (habitScore >= 40) return [0.3, 0.7, 0.9]

  if (temp === null) return [0.5, 0.5, 0.6]
  if (temp < 200) return [0.4, 0.5, 0.95]
  if (temp < 400) return [0.3, 0.75, 0.85]
  if (temp < 800) return [0.9, 0.7, 0.3]
  if (temp < 1500) return [0.95, 0.45, 0.2]
  return [0.95, 0.2, 0.15]
}

export function processExoplanets(raw: Exoplanet[]): ProcessedPlanet[] {
  const processedExo: ProcessedPlanet[] = raw.map((planet, index) => {
    const distanceLy = planet.sy_dist ? parsecsToLightYears(planet.sy_dist) : 10
    const habitabilityScore = calculateHabitability(planet)

    const raRad = (planet.ra ?? index * 20) * (Math.PI / 180)
    const decRad = (planet.dec ?? (index % 5) * 15 - 30) * (Math.PI / 180)
    
    // Spread out distance dynamically across 25 -> 350 units (clear of Solar System 0-18.5)
    const distScaled = Math.pow(Math.max(0.1, distanceLy), 0.42) * 9 + 25.0

    const x = distScaled * Math.cos(decRad) * Math.cos(raRad)
    const y = distScaled * Math.sin(decRad)
    const z = distScaled * Math.cos(decRad) * Math.sin(raRad)

    const baseRadius = planet.pl_rade ?? 1
    const visualRadius = Math.max(0.3, Math.min(0.7, Math.log2(baseRadius + 1) * 0.2))

    return {
      ...planet,
      id: `exo-${index}`,
      distanceLy,
      habitabilityScore,
      isHabitable: habitabilityScore >= 40,
      sizeCategory: categorizePlanet(planet.pl_rade),
      x, y, z,
      color: getPlanetColor(planet.pl_eqt, habitabilityScore),
      visualRadius,
    }
  })

  // Combine Solar System at center [0,0,0] with Exoplanets surrounding
  return [...SOLAR_SYSTEM_PLANETS, ...processedExo]
}
