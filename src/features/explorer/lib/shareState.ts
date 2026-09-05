import { useExplorerStore } from '../stores/explorerStore'
import type { SharedState, SharedViewInput } from '../services/shareApi'
import { DEFAULT_FILTERS } from '../types'
import { getCameraPose, requestCameraPose } from './cameraPose'

/**
 * Reading the current view out of the app, and putting a shared one back in.
 *
 * Kept out of `shareApi` so that module stays a thin wrapper over two endpoints, and out
 * of the components because both ends of the round trip belong together: whatever
 * `capture` puts in has to be what `apply` can take out.
 */

/** Everything a link could say about the view on screen right now. */
export function captureShareState(): SharedViewInput {
  const state = useExplorerStore.getState()

  return {
    filters: state.filters,
    focus: state.selectedPlanet?.id,
    // With a planet selected the camera is derived from it every frame, so sending a pose
    // would be sending a by-product. The server drops it in that case regardless; not
    // sending it keeps the request saying what it means.
    camera: state.selectedPlanet ? undefined : getCameraPose(),
    view: state.viewMode,
    timelineYear: state.timelineEnabled ? state.timelineYear : undefined,
  }
}

export interface ApplyResult {
  /** The link pins a planet this browser does not have — degraded catalog, most likely. */
  missingFocus: boolean
}

/**
 * Put a shared view on screen.
 *
 * Call once the catalog is loaded: a focused planet has to be looked up in it, and a
 * filter applied to an empty array is a filter applied to nothing.
 */
export function applySharedState(state: SharedState): ApplyResult {
  const store = useExplorerStore.getState()

  // Rebased on today's defaults rather than merged into whatever this browser was already
  // showing. A link means "these filters"; anything the sharer left alone should look the
  // way it looks for everyone, not the way the recipient last left it.
  store.setFilters({ ...DEFAULT_FILTERS, ...(state.filters ?? {}) })
  store.setViewMode(state.view ?? '3d')

  if (state.timelineYear !== undefined) {
    // Enabling resets the year to the start of the range, so the year is set second.
    store.setTimelineEnabled(true)
    useExplorerStore.getState().setTimelineYear(state.timelineYear)
  }

  // A link that pins a place skips the cinematic fly-in. The intro exists to introduce
  // the map to someone arriving at it; someone arriving at a particular view already
  // asked for somewhere specific, and the intro would spend three and a half seconds
  // flying the camera away from it. A filters-only link still gets the flourish.
  if (state.focus || state.camera) store.setIntroCompleted(true)

  if (state.focus) {
    const planet = store.planets.find((p) => p.id === state.focus)
    if (!planet) return { missingFocus: true }
    // Selecting flies the camera there, which is why a link never carries both.
    store.setSelectedPlanet(planet)
  } else if (state.camera) {
    requestCameraPose(state.camera)
  }

  return { missingFocus: false }
}
