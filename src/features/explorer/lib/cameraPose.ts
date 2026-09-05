import * as THREE from 'three'

/**
 * Where the camera is, readable from outside the canvas.
 *
 * Everything inside `<Canvas>` reaches the camera through `useThree()`, which is a React
 * context and therefore invisible to the header button that wants to put the current view
 * into a link. Rather than lift the camera into the store — it changes every frame, and a
 * Zustand write per frame would re-render half the app — the controller mirrors it into
 * these two vectors, which are plain module state. Same shape as `getPlanetWorldPosition`
 * in `PlanetCloud`, and for the same reason.
 *
 * The pose only means anything when no planet is selected. While spectating, the camera
 * is derived from the planet's live orbital position, so what is recorded here is a
 * by-product rather than a state worth restoring — see `app/share.py`.
 */

export interface CameraPose {
  position: [number, number, number]
  target: [number, number, number]
}

/** The overview the scene opens on, and what `Reset view` returns to. */
export const DEFAULT_POSE: CameraPose = { position: [0, 45, 110], target: [0, 0, 0] }

// Written every frame, so they are allocated once and copied into, never replaced.
const livePosition = new THREE.Vector3(...DEFAULT_POSE.position)
const liveTarget = new THREE.Vector3(...DEFAULT_POSE.target)

let pending: CameraPose | null = null

/** Called from `useFrame`. Must not allocate. */
export function recordCameraPose(position: THREE.Vector3, target: THREE.Vector3): void {
  livePosition.copy(position)
  liveTarget.copy(target)
}

/**
 * The current pose, rounded to hundredths.
 *
 * The server rounds to the same place before hashing, so rounding here means the link
 * shown to the visitor is a function of what they can see, not of the sub-millimetre
 * drift that damping leaves behind after they let go of the mouse.
 */
export function getCameraPose(): CameraPose {
  const round = (v: number) => Math.round(v * 100) / 100
  return {
    position: [round(livePosition.x), round(livePosition.y), round(livePosition.z)],
    target: [round(liveTarget.x), round(liveTarget.y), round(liveTarget.z)],
  }
}

/**
 * Ask the controller to jump the camera to a pose, next frame.
 *
 * A jump rather than a flight: the visitor opened a link to a particular view, and
 * animating there from an overview they never asked for would just be a delay. Applied
 * inside `useFrame` because `OrbitControls` has to be told afterwards, and only the
 * controller holds it.
 */
export function requestCameraPose(pose: CameraPose): void {
  pending = pose
}

/** Consumed by the controller. Returns the pose once, then forgets it. */
export function takePendingCameraPose(): CameraPose | null {
  const pose = pending
  pending = null
  return pose
}
