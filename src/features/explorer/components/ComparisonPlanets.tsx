import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import type * as THREE from 'three'
import { useExplorerStore } from '../stores/explorerStore'
import { getPlanetWorldPosition } from './PlanetCloud'
import { Html } from '@react-three/drei'

export function ComparisonPlanets() {
  const selectedPlanet = useExplorerStore((s) => s.selectedPlanet)
  const showComparison = useExplorerStore((s) => s.showComparison)
  const groupRef = useRef<THREE.Group>(null)

  // Use the same logarithmic visual scaling as nasaApi.ts to ensure accurate visual relative comparison
  const earthRadius = Math.max(0.3, Math.min(0.7, Math.log2(1 + 1) * 0.2)) // R⊕ = 1
  const jupiterRadius = Math.max(0.3, Math.min(0.7, Math.log2(11.2 + 1) * 0.2)) // R⊕ = 11.2

  useFrame(() => {
    if (groupRef.current && selectedPlanet) {
      const worldPos = getPlanetWorldPosition(selectedPlanet.id)
      if (worldPos) {
        groupRef.current.position.copy(worldPos)
      }
    }
  })

  const initialPos = useMemo(() => {
    if (selectedPlanet) {
      const pos = getPlanetWorldPosition(selectedPlanet.id)
      return pos ? [pos.x, pos.y, pos.z] as [number, number, number] : [0, 0, 0] as [number, number, number]
    }
    return [0, 0, 0] as [number, number, number]
  }, [selectedPlanet])

  if (!selectedPlanet || !showComparison) return null

  const planetRadius = selectedPlanet.visualRadius
  // Position Earth to the left, Jupiter to the right of the exoplanet
  const earthX = - (planetRadius + earthRadius + 0.5)
  const jupiterX = (planetRadius + jupiterRadius + 0.5)

  return (
    <group ref={groupRef} position={initialPos}>
      {/* Earth Comparison */}
      <group position={[earthX, 0, 0]}>
        <mesh>
          <sphereGeometry args={[earthRadius, 32, 32]} />
          <meshStandardMaterial color="#4287f5" roughness={0.6} metalness={0.1} />
        </mesh>
        <Html position={[0, -earthRadius - 0.3, 0]} center zIndexRange={[10, 0]} className="pointer-events-none">
          <div className="text-[10px] font-mono font-bold text-blue-400 bg-black/60 px-1.5 py-0.5 rounded border border-blue-500/30 backdrop-blur-sm whitespace-nowrap">
            Earth (1 R⊕)
          </div>
        </Html>
      </group>

      {/* Jupiter Comparison */}
      <group position={[jupiterX, 0, 0]}>
        <mesh>
          <sphereGeometry args={[jupiterRadius, 32, 32]} />
          <meshStandardMaterial color="#f5a442" roughness={0.8} metalness={0.1} />
        </mesh>
        <Html position={[0, -jupiterRadius - 0.3, 0]} center zIndexRange={[10, 0]} className="pointer-events-none">
          <div className="text-[10px] font-mono font-bold text-orange-400 bg-black/60 px-1.5 py-0.5 rounded border border-orange-500/30 backdrop-blur-sm whitespace-nowrap">
            Jupiter (11.2 R⊕)
          </div>
        </Html>
      </group>
    </group>
  )
}
