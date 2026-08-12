import { useMemo } from 'react'
import * as THREE from 'three'
import { useExplorerStore } from '../stores/explorerStore'
import { Html } from '@react-three/drei'

function GridRing({ radius, label }: { radius: number; label: string }) {
  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[radius - 0.1, radius + 0.1, 64]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.15} side={THREE.DoubleSide} />
      </mesh>
      <Html position={[radius, 0, 0]} center className="pointer-events-none opacity-40">
        <div className="font-mono text-[8px] text-purple-300">{label}</div>
      </Html>
    </group>
  )
}

export function ScientificOverlays() {
  const showScientificOverlays = useExplorerStore((s) => s.showScientificOverlays)
  const selectedPlanet = useExplorerStore((s) => s.selectedPlanet)

  const orbitRadius = useMemo(() => {
    if (!selectedPlanet) return 0
    return Math.sqrt(
      selectedPlanet.x * selectedPlanet.x +
      selectedPlanet.y * selectedPlanet.y +
      selectedPlanet.z * selectedPlanet.z
    )
  }, [selectedPlanet])

  if (!showScientificOverlays) return null

  return (
    <group>
      {/* Distance Grid Rings (Logarithmic scaled radii for visual scale) */}
      <GridRing radius={20} label="100 ly" />
      <GridRing radius={50} label="1000 ly" />
      <GridRing radius={100} label="5000 ly" />

      {/* Crosshairs to show galactic center / origin */}
      <mesh>
        <cylinderGeometry args={[0.1, 0.1, 200]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.1} />
      </mesh>
      <mesh rotation={[0, 0, Math.PI / 2]}>
        <cylinderGeometry args={[0.1, 0.1, 200]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.1} />
      </mesh>
      <mesh rotation={[Math.PI / 2, 0, 0]}>
        <cylinderGeometry args={[0.1, 0.1, 200]} />
        <meshBasicMaterial color="#a855f7" transparent opacity={0.1} />
      </mesh>

      {/* Orbit Path of Selected Planet (P6.4) */}
      {selectedPlanet && orbitRadius > 0.1 && (
        <group rotation={[-Math.PI / 2, 0, 0]}>
          <mesh>
            <ringGeometry args={[orbitRadius - 0.05, orbitRadius + 0.05, 128]} />
            <meshBasicMaterial color="#ffffff" transparent opacity={0.3} side={THREE.DoubleSide} />
          </mesh>
        </group>
      )}
    </group>
  )
}
