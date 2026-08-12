/* eslint-disable */
import { useRef, useMemo, useEffect } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import * as THREE from 'three'
import { useExplorerStore } from '../stores/explorerStore'
import { playSound } from '../services/audio'

/**
 * PlanetCloud — Renders ALL exoplanets using a single InstancedMesh.
 *
 * PERFORMANCE LESSON FROM FACTORY DASHBOARD:
 * - Factory: 4 separate MachineCard components with 5+ useEffect + setState each → 2.1GB RAM
 * - Exoplanet: 5,700+ planets rendered as 1 single GPU draw call via InstancedMesh
 * - Animation via useRef (GPU mutation), NOT useState (React re-render)
 * - Expected RAM: < 30MB for the entire planet field
 */
// Shared realtime local position store
export const currentPlanetPositions = new Map<string, THREE.Vector3>()
export let sharedMeshRef: THREE.InstancedMesh | null = null

export const getPlanetWorldPosition = (id: string): THREE.Vector3 | null => {
  const localPos = currentPlanetPositions.get(id)
  if (!localPos) return null

  if (id.startsWith('sol-')) {
    // Solar system planets are rendered directly in the scene (no world matrix offset)
    return localPos.clone()
  }

  if (sharedMeshRef) {
    return localPos.clone().applyMatrix4(sharedMeshRef.matrixWorld)
  }
  return localPos.clone()
}

export function PlanetCloud() {
  const meshRefHigh = useRef<THREE.InstancedMesh>(null)
  const meshRefLow = useRef<THREE.InstancedMesh>(null)
  const hitMeshRef = useRef<THREE.InstancedMesh>(null)
  const { invalidate } = useThree()
  const filteredPlanets = useExplorerStore((s) => s.filteredPlanets)
  const setHoveredPlanetId = useExplorerStore((s) => s.setHoveredPlanetId)
  const setSelectedPlanet = useExplorerStore((s) => s.setSelectedPlanet)
  const selectedPlanet = useExplorerStore((s) => s.selectedPlanet)

  useEffect(() => {
    // We only need one of the visual meshes for tracking rotation in getPlanetWorldPosition
    // since they both rotate identically.
    sharedMeshRef = meshRefHigh.current || meshRefLow.current
  }, [])

  // Filter out ALL solar system planets from InstancedMesh
  const displayPlanets = useMemo(
    () => filteredPlanets.filter((p) => !p.id.startsWith('sol-')),
    [filteredPlanets]
  )

  // Reusable objects (NEVER allocate inside useFrame — prevents GC pressure)
  const tempObject = useMemo(() => new THREE.Object3D(), [])
  const tempColor = useMemo(() => new THREE.Color(), [])

  // Geometry & Material: created once, shared by all instances
  const highPolyGeometry = useMemo(() => new THREE.SphereGeometry(1, 12, 8), [])
  const lowPolyGeometry = useMemo(() => new THREE.SphereGeometry(1, 4, 3), [])
  const material = useMemo(
    () =>
      new THREE.MeshStandardMaterial({
        roughness: 0.6,
        metalness: 0.2,
        envMapIntensity: 0.5,
      }),
    []
  )

  const maxCount = 8000 // Pre-allocate for max possible planets

  // Update instance positions when filtered data changes
  useEffect(() => {
    let highCount = 0
    let lowCount = 0

    displayPlanets.forEach((planet, i) => {
      if (i >= maxCount) return

      tempObject.position.set(planet.x, planet.y, planet.z)
      const distSq = planet.x * planet.x + planet.y * planet.y + planet.z * planet.z
      const isHighPoly = distSq < 10000 // Distance < 100 units

      if (isHighPoly && meshRefHigh.current) {
        tempObject.scale.setScalar(planet.visualRadius)
        tempObject.updateMatrix()
        meshRefHigh.current.setMatrixAt(highCount, tempObject.matrix)
        tempColor.setRGB(planet.color[0], planet.color[1], planet.color[2])
        meshRefHigh.current.setColorAt(highCount, tempColor)
        highCount++
      } else if (!isHighPoly && meshRefLow.current) {
        tempObject.scale.setScalar(planet.visualRadius)
        tempObject.updateMatrix()
        meshRefLow.current.setMatrixAt(lowCount, tempObject.matrix)
        tempColor.setRGB(planet.color[0], planet.color[1], planet.color[2])
        meshRefLow.current.setColorAt(lowCount, tempColor)
        lowCount++
      }

      // Hit mesh uses exact index `i` to map perfectly to `displayPlanets[instanceId]`
      if (hitMeshRef.current) {
        const isSelected = selectedPlanet && selectedPlanet.id === planet.id
        tempObject.scale.setScalar(planet.visualRadius * (isSelected ? 1 : 6))
        tempObject.updateMatrix()
        hitMeshRef.current.setMatrixAt(i, tempObject.matrix)
      }

      // Store initial static local position
      currentPlanetPositions.set(planet.id, new THREE.Vector3(planet.x, planet.y, planet.z))
    })

    if (meshRefHigh.current) {
      meshRefHigh.current.count = highCount
      meshRefHigh.current.instanceMatrix.needsUpdate = true
      if (meshRefHigh.current.instanceColor) meshRefHigh.current.instanceColor.needsUpdate = true
    }
    if (meshRefLow.current) {
      meshRefLow.current.count = lowCount
      meshRefLow.current.instanceMatrix.needsUpdate = true
      if (meshRefLow.current.instanceColor) meshRefLow.current.instanceColor.needsUpdate = true
    }
    if (hitMeshRef.current) {
      hitMeshRef.current.count = Math.min(displayPlanets.length, maxCount)
      hitMeshRef.current.instanceMatrix.needsUpdate = true
    }

    invalidate()
  }, [displayPlanets, selectedPlanet, tempObject, tempColor, invalidate, maxCount])

  // Real-time orbital motion — GPU matrix mutation, 0 React re-renders!
  const accumulatedTime = useRef(0)

  useFrame((_, delta) => {
    const meshHigh = meshRefHigh.current
    const meshLow = meshRefLow.current
    if (!meshHigh && !meshLow) return

    const simulationSpeed = useExplorerStore.getState().simulationSpeed
    // Accumulate time based on delta to prevent teleporting when speed changes
    accumulatedTime.current += delta * simulationSpeed
    const time = accumulatedTime.current

    // P1.4 Galaxy Rotation: slowly rotate the entire exoplanet cloud
    if (meshHigh) {
      meshHigh.rotation.y = time * 0.02
      meshHigh.updateMatrixWorld() // Ensure world matrix is updated for tracking
    }
    if (meshLow) {
      meshLow.rotation.y = time * 0.02
      meshLow.updateMatrixWorld()
    }

    const hitMesh = hitMeshRef.current
    if (hitMesh) {
      hitMesh.rotation.y = time * 0.02
      hitMesh.updateMatrixWorld()
    }
  })

  // Track pointer down coordinates to distinguish between click and drag
  const pointerDownPos = useRef<{ x: number; y: number } | null>(null)

  const handlePointerDown = (e: THREE.Event) => {
    // @ts-expect-error R3F event typing
    const nativeEvt = e.nativeEvent as MouseEvent | TouchEvent | undefined
    if (nativeEvt) {
      const clientX = 'touches' in nativeEvt ? nativeEvt.touches[0].clientX : (nativeEvt as MouseEvent).clientX
      const clientY = 'touches' in nativeEvt ? nativeEvt.touches[0].clientY : (nativeEvt as MouseEvent).clientY
      pointerDownPos.current = { x: clientX, y: clientY }
    }
  }

  // Handle click on planet instance (ignored if user dragged the mouse)
  const handleClick = (e: THREE.Event) => {
    // Check drag distance
    if (pointerDownPos.current) {
      // @ts-expect-error R3F event typing
      const nativeEvt = e.nativeEvent as MouseEvent | TouchEvent | undefined
      if (nativeEvt) {
        const clientX = 'changedTouches' in nativeEvt ? nativeEvt.changedTouches[0].clientX : (nativeEvt as MouseEvent).clientX
        const clientY = 'changedTouches' in nativeEvt ? nativeEvt.changedTouches[0].clientY : (nativeEvt as MouseEvent).clientY
        const dx = clientX - pointerDownPos.current.x
        const dy = clientY - pointerDownPos.current.y
        const dist = Math.sqrt(dx * dx + dy * dy)
        // If moved more than 5 pixels, treat as a drag operation, not a click!
        if (dist > 5) return
      }
    }

    // @ts-expect-error R3F event typing
    const instanceId = e.instanceId as number | undefined
    if (instanceId !== undefined && instanceId < displayPlanets.length) {
      // @ts-expect-error R3F event typing
      e.stopPropagation()
      setSelectedPlanet(displayPlanets[instanceId])
      playSound('click')
    }
  }

  // Handle hover
  const handlePointerEnter = (e: THREE.Event) => {
    // @ts-expect-error R3F event typing
    const instanceId = e.instanceId as number | undefined
    if (instanceId !== undefined && instanceId < displayPlanets.length) {
      // @ts-expect-error R3F event typing
      e.stopPropagation()
      setHoveredPlanetId(displayPlanets[instanceId].id)
      document.body.style.cursor = 'pointer'
      playSound('hover')
    }
  }

  const handlePointerLeave = () => {
    setHoveredPlanetId(null)
    document.body.style.cursor = 'auto'
  }

  // No scale-up on hover to prevent raycast flickering on sub-pixel targets.

  // Cleanup GPU resources on unmount — CRITICAL to prevent VRAM leaks
  useEffect(() => {
    return () => {
      highPolyGeometry.dispose()
      lowPolyGeometry.dispose()
      material.dispose()
    }
  }, [highPolyGeometry, lowPolyGeometry, material])

  return (
    <group>
      <instancedMesh
        ref={meshRefHigh}
        args={[highPolyGeometry, material, maxCount]}
        frustumCulled={false}
      />
      <instancedMesh
        ref={meshRefLow}
        args={[lowPolyGeometry, material, maxCount]}
        frustumCulled={false}
      />
      {/* Invisible hit-mesh with larger bounds to make hover/click reliable on sub-pixel distant planets */}
      <instancedMesh
        ref={hitMeshRef}
        args={[lowPolyGeometry, material, maxCount]}
        onPointerDown={handlePointerDown}
        onClick={handleClick}
        onPointerEnter={handlePointerEnter}
        onPointerLeave={handlePointerLeave}
        visible={false}
        frustumCulled={false}
      />
    </group>
  )
}
