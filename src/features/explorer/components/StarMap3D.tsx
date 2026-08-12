import { Suspense, useEffect, useRef, useMemo } from 'react'
import { Canvas, useThree, useFrame } from '@react-three/fiber'
import { OrbitControls, Html } from '@react-three/drei'
import * as THREE from 'three'
import { PlanetCloud, getPlanetWorldPosition } from './PlanetCloud'
import { Starfield } from './Starfield'
import { SunEffects } from './SunEffects'
import { SolarSystemPlanets } from './SolarSystemPlanets'
import { ComparisonPlanets } from './ComparisonPlanets'
import { HabitableZoneRing } from './HabitableZoneRing'
import { ScientificOverlays } from './ScientificOverlays'
import { DetailedPlanetOverlay } from './DetailedPlanetOverlay'
import { useExplorerStore } from '../stores/explorerStore'
import { playSound } from '../services/audio'
import { ambientSynth } from '../services/ambientSynth'
import { useTranslation } from 'react-i18next'
import { translateTerm } from '../lib/astronomyDictionary'

/** Tooltip that follows the hovered planet in 3D space */
function PlanetTooltip() {
  const { t, i18n } = useTranslation()
  const hoveredPlanetId = useExplorerStore((s) => s.hoveredPlanetId)
  const planets = useExplorerStore((s) => s.planets)
  const groupRef = useRef<THREE.Group>(null)

  const hoveredPlanet = useMemo(
    () => planets.find((p) => p.id === hoveredPlanetId),
    [hoveredPlanetId, planets]
  )

  useFrame(() => {
    if (groupRef.current && hoveredPlanetId) {
      const worldPos = getPlanetWorldPosition(hoveredPlanetId)
      if (worldPos) {
        groupRef.current.position.copy(worldPos)
      }
    }
  })

  const initialPos = useMemo(() => {
    if (hoveredPlanetId) {
      const pos = getPlanetWorldPosition(hoveredPlanetId)
      return pos ? [pos.x, pos.y, pos.z] as [number, number, number] : [0, 0, 0] as [number, number, number]
    }
    return [0, 0, 0] as [number, number, number]
  }, [hoveredPlanetId])

  if (!hoveredPlanet) return null

  return (
    <group ref={groupRef} position={initialPos}>
      <Html
        position={[hoveredPlanet.visualRadius + 0.5, hoveredPlanet.visualRadius + 0.5, 0]}
        center
        className='pointer-events-none z-10 transition-opacity duration-200'
        zIndexRange={[100, 0]}
      >
        <div className="flex flex-col whitespace-nowrap rounded-lg border border-cyan-500/30 bg-black/80 px-3 py-2 font-mono text-xs text-white shadow-lg backdrop-blur-md">
          <span className="font-bold text-cyan-400">{hoveredPlanet.pl_name}</span>
          <span className="text-gray-400">{t('tooltip.distance')}: {hoveredPlanet.sy_dist ? `${hoveredPlanet.sy_dist} ly` : t('tooltip.unknown')}</span>
          <span className="text-gray-400">{t('tooltip.type')}: {translateTerm(hoveredPlanet.sizeCategory, i18n.language)}</span>
        </div>
      </Html>
    </group>
  )
}

/**
 * CameraController — Two-phase spectate:
 *  Phase 1 (isFlyingTo): Camera lerps to planet. Stops touching controls after arrival.
 *  Phase 2 (tracking): Each frame shifts camera+target by the same delta as the planet moved.
 *  Not spectating: does NOTHING — OrbitControls handles all input freely.
 */
function CameraController() {
  const { camera, controls } = useThree()
  const selectedPlanet = useExplorerStore((s) => s.selectedPlanet)
  const flightTrigger = useExplorerStore((s) => s.flightTrigger)
  const cameraResetTrigger = useExplorerStore((s) => s.cameraResetTrigger)

  const isFlyingTo = useRef(false)
  const isReturning = useRef(false)
  const prevSelectedId = useRef<number | null>(null)
  const prevWorldPos = useRef<THREE.Vector3 | null>(null)

  const overviewPos = useRef(new THREE.Vector3(0, 45, 110))
  const overviewTarget = useRef(new THREE.Vector3(0, 0, 0))

  useEffect(() => {
    // @ts-expect-error R3F controls typing
    const oc = controls as { target: THREE.Vector3; update: () => void } | undefined

    if (selectedPlanet && flightTrigger > 0) {
      if (flightTrigger !== prevSelectedId.current) {
        isFlyingTo.current = true
        isReturning.current = false
        prevSelectedId.current = flightTrigger
        prevWorldPos.current = null
        playSound('woosh')
        ambientSynth.playPlanetDrone(selectedPlanet)
      }
    } else {
      if (prevSelectedId.current !== null) {
        // Just ended spectate — save current overview pos before returning
        overviewPos.current.copy(camera.position)
        overviewTarget.current.copy(oc?.target ?? new THREE.Vector3(0, 0, 0))
        isReturning.current = true
        isFlyingTo.current = false
        prevSelectedId.current = null
        prevWorldPos.current = null
        ambientSynth.stop()
      }
    }
  }, [selectedPlanet, camera, controls, flightTrigger])

  // Handle manual camera reset
  useEffect(() => {
    if (cameraResetTrigger > 0) {
      overviewPos.current.set(0, 45, 110)
      overviewTarget.current.set(0, 0, 0)
      isReturning.current = true
      isFlyingTo.current = false
      playSound('woosh')
    }
  }, [cameraResetTrigger])

  useFrame((_, delta) => {
    // @ts-expect-error R3F controls typing
    const oc = controls as { target: THREE.Vector3; update: () => void } | undefined

    if (selectedPlanet) {
      const worldPos = getPlanetWorldPosition(selectedPlanet.id) ??
        new THREE.Vector3(selectedPlanet.x, selectedPlanet.y, selectedPlanet.z)

      if (isFlyingTo.current) {
        // Phase 1: Fly-to animation
        const desiredCamPos = new THREE.Vector3(
          worldPos.x + 3.5,
          worldPos.y + 2.0,
          worldPos.z + 4.5
        )
        camera.position.lerp(desiredCamPos, delta * 7.5)
        if (oc) {
          oc.target.lerp(worldPos, delta * 9)
          oc.update()
        }
        if (camera.position.distanceTo(desiredCamPos) < 0.8) {
          isFlyingTo.current = false
          prevWorldPos.current = worldPos.clone()
        }
      } else {
        // Phase 2: Delta tracking — preserves user's 360° free rotation
        if (oc && prevWorldPos.current) {
          const deltaVec = worldPos.clone().sub(prevWorldPos.current)
          camera.position.add(deltaVec)
          oc.target.add(deltaVec)
          oc.update()
        }
        prevWorldPos.current = worldPos.clone()
      }

    } else if (isReturning.current) {
      // Return quickly to default overview after spectate ends
      const defaultPos = new THREE.Vector3(0, 45, 110)
      const defaultTarget = new THREE.Vector3(0, 0, 0)

      camera.position.lerp(defaultPos, delta * 8)
      if (oc) {
        oc.target.lerp(defaultTarget, delta * 9)
        oc.update()
      }

      // Stop lerping quickly (distance < 3.0) — hand control fully back to OrbitControls instantly
      if (camera.position.distanceTo(defaultPos) < 3.0) {
        isReturning.current = false
      }
    }
    // If neither spectating nor returning → do NOTHING; OrbitControls handles all input
  })

  return null
}

export function StarMap3D() {
  const { t } = useTranslation()
  const selectedPlanet = useExplorerStore((s) => s.selectedPlanet)
  const setSelectedPlanet = useExplorerStore((s) => s.setSelectedPlanet)

  // P1.2: Keyboard Shortcuts (Escape: exit spectate, Space: reset view, F: focus hovered planet)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) return

      if (e.key === 'Escape') {
        setSelectedPlanet(null)
      } else if (e.key === ' ') {
        e.preventDefault()
        setSelectedPlanet(null)
      } else if (e.key.toLowerCase() === 'f') {
        const hoveredId = useExplorerStore.getState().hoveredPlanetId
        if (hoveredId) {
          const planet = useExplorerStore.getState().planets.find((p) => p.id === hoveredId)
          if (planet) {
            setSelectedPlanet(planet)
          }
        }
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [setSelectedPlanet])

  return (
    <div className='relative h-full w-full'>
      <Canvas
        frameloop='always'
        camera={{ position: [0, 25, 75], fov: 60, near: 0.1, far: 2000 }}
        // @ts-expect-error R3F raycaster typing
        raycaster={{ params: { Points: { threshold: 0.5 }, Line: { threshold: 0.5 } } }}
        gl={{
          antialias: true,
          alpha: false,
          powerPreference: 'high-performance',
          pixelRatio: Math.min(window.devicePixelRatio, 2),
        }}
        style={{ background: 'radial-gradient(ellipse at center, #0a0a1a 0%, #000005 100%)' }}
        onCreated={({ gl }) => {
          gl.setClearColor('#000005')
          gl.toneMapping = 2
          gl.toneMappingExposure = 1.2
        }}
      >
        <Suspense fallback={null}>
          <CameraController />

          {/* Lighting */}
          <ambientLight intensity={0.3} />
          {/* Sun Effects (Core glow, Corona, Solar flares, Orbit Rings) */}
          <SunEffects />

          {/* Background stars */}
          <Starfield />
          <SolarSystemPlanets />
          <PlanetCloud />
          <PlanetTooltip />
        
          {/* Phase 6: Scientific and Visual Enhancements */}
          <ComparisonPlanets />
          <HabitableZoneRing />
          <ScientificOverlays />

          {/* Phase 7: Custom Surface Shaders (Spectator Overlay) */}
          <DetailedPlanetOverlay />

          {/* Camera controls — always enabled, CameraController moves it programmatically when spectating */}
          <OrbitControls
            enableDamping
            dampingFactor={0.08}
            minDistance={2}
            maxDistance={800}
            enablePan
            panSpeed={0.6}
            rotateSpeed={0.5}
            zoomSpeed={0.9}
            makeDefault
          />
        </Suspense>
      </Canvas>

      {/* Spectate Badge — visible only when spectating */}
      {selectedPlanet && (
        <div className='pointer-events-none absolute top-3 left-1/2 -translate-x-1/2 z-20 flex items-center gap-2 rounded-full border border-cyan-500/30 bg-cyan-950/70 px-4 py-1.5 font-mono text-[11px] text-cyan-300 backdrop-blur-sm shadow-lg'>
          <span className='h-1.5 w-1.5 animate-ping rounded-full bg-cyan-400' />
          👁 {t('controls.spectating')} · {selectedPlanet.pl_name}
          <button
            className='pointer-events-auto ml-2 rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/70 hover:bg-white/20 transition-colors'
            onClick={() => setSelectedPlanet(null)}
          >
            ✕ {t('controls.exitEsc')}
          </button>
        </div>
      )}

      {/* Status Overlay & Keyboard Hints */}
      <div className='pointer-events-none absolute bottom-3 left-3 flex items-center gap-3 rounded-md border border-white/10 bg-black/60 px-3 py-1.5 font-mono text-[10px] text-white/60 backdrop-blur-sm'>
        <div className='flex items-center gap-1.5'>
          <span className='h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400' />
          {selectedPlanet
            ? t('controls.spectatingHint')
            : t('controls.defaultHint')}
        </div>
        <div className='h-3 w-px bg-white/20' />
        <div className='flex items-center gap-2 text-cyan-300/80'>
          <span><kbd className='rounded bg-white/10 px-1 py-0.5 text-[9px] text-white'>Esc</kbd> {t('controls.exit')}</span>
          <span><kbd className='rounded bg-white/10 px-1 py-0.5 text-[9px] text-white'>Space</kbd> {t('controls.resetView')}</span>
          <span><kbd className='rounded bg-white/10 px-1 py-0.5 text-[9px] text-white'>F</kbd> {t('controls.focusHovered')}</span>
        </div>
      </div>
    </div>
  )
}
