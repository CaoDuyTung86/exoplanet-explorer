import { useRef, useMemo } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * CursorTrail — Cosmic dust particles that follow the mouse cursor in 3D space.
 * 
 * Uses a ring buffer of 80 particles. Each frame adds 1 particle at cursor position
 * (unprojected to a plane at z=-10 from camera). Particles fade out over time.
 * 
 * Single Points draw call — virtually free (~0.1ms/frame).
 */
const PARTICLE_COUNT = 80
const PARTICLE_LIFETIME = 2.0 // seconds

export function CursorTrail() {
  const pointsRef = useRef<THREE.Points>(null)
  const { camera } = useThree()
  
  const mouseRef = useRef({ x: 0, y: 0, active: false })
  const writeIndex = useRef(0)
  
  // Pre-allocate buffers
  const positions = useMemo(() => new Float32Array(PARTICLE_COUNT * 3).fill(0), [])
  const alphas = useMemo(() => new Float32Array(PARTICLE_COUNT).fill(0), [])
  const ages = useMemo(() => new Float32Array(PARTICLE_COUNT).fill(PARTICLE_LIFETIME + 1), [])

  // Track mouse position in normalized device coordinates
  useFrame((state, delta) => {
    const pointer = state.pointer
    mouseRef.current.x = pointer.x
    mouseRef.current.y = pointer.y
    
    // Only emit if mouse has moved recently
    const isMoving = Math.abs(pointer.x) > 0.01 || Math.abs(pointer.y) > 0.01

    if (isMoving) {
      // Unproject mouse to 3D world position on a plane in front of camera
      const vec = new THREE.Vector3(pointer.x, pointer.y, 0.5)
      vec.unproject(camera)
      const dir = vec.sub(camera.position).normalize()
      const dist = 15 // Distance from camera to place particles
      const worldPos = camera.position.clone().add(dir.multiplyScalar(dist))

      // Write new particle
      const idx = writeIndex.current % PARTICLE_COUNT
      positions[idx * 3] = worldPos.x
      positions[idx * 3 + 1] = worldPos.y
      positions[idx * 3 + 2] = worldPos.z
      ages[idx] = 0
      alphas[idx] = 1.0
      writeIndex.current++
    }

    // Update all particles
    for (let i = 0; i < PARTICLE_COUNT; i++) {
      ages[i] += delta
      if (ages[i] < PARTICLE_LIFETIME) {
        alphas[i] = Math.max(0, 1 - ages[i] / PARTICLE_LIFETIME)
      } else {
        alphas[i] = 0
        // Move expired particles far away
        positions[i * 3 + 1] = -9999
      }
    }

    if (pointsRef.current) {
      pointsRef.current.geometry.attributes.position.needsUpdate = true
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute attach="attributes-position" args={[positions, 3]} />
      </bufferGeometry>
      <pointsMaterial
        size={0.08}
        sizeAttenuation
        color="#66ccff"
        transparent
        opacity={0.4}
        depthWrite={false}
        blending={THREE.AdditiveBlending}
      />
    </points>
  )
}
