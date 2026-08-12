import { useMemo } from 'react'
import * as THREE from 'three'
import { useExplorerStore } from '../stores/explorerStore'

export function HabitableZoneRing() {
  const selectedPlanet = useExplorerStore((s) => s.selectedPlanet)

  const radius = useMemo(() => {
    if (!selectedPlanet) return 0
    return Math.sqrt(selectedPlanet.x * selectedPlanet.x + selectedPlanet.y * selectedPlanet.y + selectedPlanet.z * selectedPlanet.z)
  }, [selectedPlanet])

  if (!selectedPlanet) return null

  const isHabitable = selectedPlanet.isHabitable
  const color = isHabitable ? "#34d399" : "#ef4444" // Emerald for habitable, Red for outside

  return (
    <group rotation={[-Math.PI / 2, 0, 0]}>
      <mesh>
        <ringGeometry args={[radius - 0.2, radius + 0.2, 128]} />
        <meshBasicMaterial 
          color={color} 
          transparent={true} 
          opacity={0.15} 
          side={THREE.DoubleSide} 
          blending={THREE.AdditiveBlending}
        />
      </mesh>
      <mesh>
        {/* Glow edge */}
        <ringGeometry args={[radius - 0.05, radius + 0.05, 128]} />
        <meshBasicMaterial 
          color={color} 
          transparent={true} 
          opacity={0.4} 
          side={THREE.DoubleSide} 
          blending={THREE.AdditiveBlending}
        />
      </mesh>
    </group>
  )
}
