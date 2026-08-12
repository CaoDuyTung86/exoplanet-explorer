import { processExoplanets } from './nasaApi'
import type { Exoplanet } from '../types'

self.onmessage = (e: MessageEvent<{ rawData: Exoplanet[] }>) => {
  try {
    const { rawData } = e.data
    // Run the heavy O(N) processing off the main thread
    const processedPlanets = processExoplanets(rawData)
    self.postMessage({ type: 'SUCCESS', payload: processedPlanets })
  } catch (error) {
    self.postMessage({ type: 'ERROR', error: (error as Error).message })
  }
}
