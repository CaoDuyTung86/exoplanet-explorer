import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useExplorerStore } from '../stores/explorerStore'

/**
 * IntroSequence — Cinematic warp-speed fly-in when the app first loads.
 * 
 * 1. Camera starts far away (z=600)
 * 2. "Speed lines" (stretched particles) fly past the camera
 * 3. Camera decelerates with cubic ease-out toward overview position [0, 45, 110]
 * 4. After ~3s, auto-completes and unmounts
 * 5. Can be skipped via click/keypress
 */

const INTRO_DURATION = 3.5 // seconds
const START_POS = new THREE.Vector3(0, 80, 600)
const END_POS = new THREE.Vector3(0, 45, 110)
const TARGET_POS = new THREE.Vector3(0, 0, 0)

function generateIntroParticles() {
  const count = 600
  const pos = new Float32Array(count * 3)
  const vel = new Float32Array(count * 3)

  for (let i = 0; i < count; i++) {
    // Distribute in a cylinder around the camera path
    const angle = Math.random() * Math.PI * 2
    const r = 5 + Math.random() * 60
    pos[i * 3] = Math.cos(angle) * r
    pos[i * 3 + 1] = Math.sin(angle) * r
    pos[i * 3 + 2] = Math.random() * 500 - 100

    // Velocity: mostly backwards (negative Z)
    vel[i * 3] = (Math.random() - 0.5) * 0.5
    vel[i * 3 + 1] = (Math.random() - 0.5) * 0.5
    vel[i * 3 + 2] = -(20 + Math.random() * 40)
  }
  return [pos, vel] as const
}

export function IntroSequence() {
  const { camera, controls } = useThree()
  const introCompleted = useExplorerStore((s) => s.introCompleted)
  const setIntroCompleted = useExplorerStore((s) => s.setIntroCompleted)
  const isLoading = useExplorerStore((s) => s.isLoading)
  
  const progressRef = useRef(0)
  const linesRef = useRef<THREE.Points>(null)
  const initialized = useRef(false)

  // Speed lines — stretched particles that fly past the camera
  const [positions, velocities] = useMemo(() => generateIntroParticles(), [])

  // Initialize camera position on first frame
  useFrame((_, delta) => {
    if (introCompleted) return

    if (!initialized.current) {
      camera.position.copy(START_POS)
      camera.lookAt(TARGET_POS)
      initialized.current = true
    }

    // Wait for the main loading overlay to finish before starting the animation
    if (isLoading) return

    progressRef.current += delta

    // Cubic ease-out: t = 1 - (1 - p)^3
    const p = Math.min(progressRef.current / INTRO_DURATION, 1)
    const t = 1 - Math.pow(1 - p, 3)

    // Interpolate camera position
    camera.position.lerpVectors(START_POS, END_POS, t)
    
    // Update orbit controls target
    // @ts-expect-error R3F controls typing
    const oc = controls as { target: THREE.Vector3; update: () => void } | undefined
    if (oc) {
      oc.target.copy(TARGET_POS)
      oc.update()
    }

    // Animate speed lines
    if (linesRef.current) {
      const posArray = linesRef.current.geometry.attributes.position.array as Float32Array
      const speed = (1 - t) * 1.5 // Lines slow down as camera decelerates

      for (let i = 0; i < posArray.length / 3; i++) {
        posArray[i * 3] += velocities[i * 3] * delta * speed
        posArray[i * 3 + 1] += velocities[i * 3 + 1] * delta * speed
        posArray[i * 3 + 2] += velocities[i * 3 + 2] * delta * speed

        // Reset particles that pass behind camera
        if (posArray[i * 3 + 2] < camera.position.z - 50) {
          posArray[i * 3 + 2] = camera.position.z + 200 + Math.random() * 200
        }
      }
      linesRef.current.geometry.attributes.position.needsUpdate = true

      // Fade out speed lines as we approach the end
      const material = linesRef.current.material as THREE.PointsMaterial
      material.opacity = Math.max(0, 1 - t * 1.5)
    }

    // Complete intro
    if (p >= 1) {
      setIntroCompleted(true)
    }
  })

  if (introCompleted) return null

  return (
    <points ref={linesRef}>
      <bufferGeometry>
        <bufferAttribute
          attach="attributes-position"
          args={[positions, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.15}
        sizeAttenuation
        color="#88ccff"
        transparent
        opacity={1}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
