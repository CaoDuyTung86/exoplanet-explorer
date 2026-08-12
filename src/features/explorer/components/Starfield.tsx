import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * Starfield — Renders ~3,000 background stars using THREE.Points (1 draw call).
 * All animation via useRef mutation — zero React state updates.
 */
export function Starfield() {
  const pointsRef = useRef<THREE.Points>(null)

  const [positions, colors] = useMemo(() => {
    const count = 10000 // Increased for denser Milky Way
    const pos = new Float32Array(count * 3)
    const col = new Float32Array(count * 3)

    for (let i = 0; i < count; i++) {
      // P2.3: Milky Way Band Distribution
      const isBand = Math.random() < 0.7 // 70% of stars form the galactic band
      const theta = Math.random() * Math.PI * 2
      let phi = 0
      
      if (isBand) {
        // Gaussian-like concentration around the equator (PI / 2)
        const u = Math.random()
        const v = Math.random()
        const z = Math.sqrt(-2.0 * Math.max(0.0001, Math.log(u))) * Math.cos(2.0 * Math.PI * v)
        // Spread the band by ~0.2 radians
        phi = Math.PI / 2 + z * 0.2
        
        // Add random dust gap (dimmer/fewer stars exactly at equator)
        if (Math.abs(phi - Math.PI / 2) < 0.05 && Math.random() > 0.3) {
          phi += (Math.random() > 0.5 ? 0.08 : -0.08)
        }
      } else {
        // Uniform background stars
        phi = Math.acos(2 * Math.random() - 1)
      }

      const r = 250 + Math.random() * 400

      pos[i * 3] = r * Math.sin(phi) * Math.cos(theta)
      pos[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta)
      pos[i * 3 + 2] = r * Math.cos(phi)

      // Slightly varied star colors (white/blue/warm)
      const temp = Math.random()
      
      // Make band stars slightly dimmer overall, background stars can be brighter
      const intensity = isBand ? 0.4 + Math.random() * 0.4 : 0.6 + Math.random() * 0.4

      if (temp < 0.6) {
        // White
        col[i * 3] = (0.9 + Math.random() * 0.1) * intensity
        col[i * 3 + 1] = (0.9 + Math.random() * 0.1) * intensity
        col[i * 3 + 2] = 1.0 * intensity
      } else if (temp < 0.85) {
        // Blue-white
        col[i * 3] = 0.7 * intensity
        col[i * 3 + 1] = 0.8 * intensity
        col[i * 3 + 2] = 1.0 * intensity
      } else {
        // Warm yellow
        col[i * 3] = 1.0 * intensity
        col[i * 3 + 1] = 0.85 * intensity
        col[i * 3 + 2] = 0.6 * intensity
      }
    }

    return [pos, col]
  }, [])

  // Slow rotation via ref mutation — NO useState
  useFrame((_, delta) => {
    if (pointsRef.current) {
      pointsRef.current.rotation.y += delta * 0.003
      pointsRef.current.rotation.x += delta * 0.001
    }
  })

  return (
    <points ref={pointsRef}>
      <bufferGeometry>
        <bufferAttribute
          attach='attributes-position'
          args={[positions, 3]}
        />
        <bufferAttribute
          attach='attributes-color'
          args={[colors, 3]}
        />
      </bufferGeometry>
      <pointsMaterial
        size={0.3}
        sizeAttenuation
        vertexColors
        transparent
        opacity={0.8}
        depthWrite={false}
      />
    </points>
  )
}
