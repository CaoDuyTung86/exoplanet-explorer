import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useTexture, Line } from '@react-three/drei'
import { useExplorerStore } from '../stores/explorerStore'
import { playSound } from '../services/audio'

/**
 * SunEffects — Renders realistic Sun glow, corona atmosphere, point light,
 * glowing solar flare rings, and orbital path rings around the origin [0,0,0].
 */
export function SunEffects() {
  const sunRef = useRef<THREE.Mesh>(null)
  const coronaRef = useRef<THREE.Sprite>(null)
  const flareRef = useRef<THREE.Sprite>(null)
  const lightRef = useRef<THREE.PointLight>(null)

  const sunTexture = useTexture('/textures/sun_color.jpg')

  // Generate a beautiful radial gradient texture for the Sun's glow
  const glowTexture = useMemo(() => {
    const canvas = document.createElement('canvas')
    canvas.width = 256
    canvas.height = 256
    const context = canvas.getContext('2d')
    if (context) {
      const gradient = context.createRadialGradient(128, 128, 0, 128, 128, 128)
      gradient.addColorStop(0, 'rgba(255, 220, 150, 1)')
      gradient.addColorStop(0.2, 'rgba(255, 150, 0, 0.8)')
      gradient.addColorStop(0.5, 'rgba(255, 50, 0, 0.3)')
      gradient.addColorStop(1, 'rgba(0, 0, 0, 0)')
      context.fillStyle = gradient
      context.fillRect(0, 0, 256, 256)
    }
    return new THREE.CanvasTexture(canvas)
  }, [])

  const planets = useExplorerStore((s) => s.planets)
  const setSelectedPlanet = useExplorerStore((s) => s.setSelectedPlanet)
  const setHoveredPlanetId = useExplorerStore((s) => s.setHoveredPlanetId)

  const handleSunClick = (e: THREE.Event) => {
    // @ts-expect-error R3F event typing
    e.stopPropagation()
    const sunPlanet = planets.find((p) => p.id === 'sol-sun')
    if (sunPlanet) {
      setSelectedPlanet(sunPlanet)
      playSound('click')
    }
  }

  const orbitRadii = [
    { name: 'Mercury', radius: 3.5, color: '#94a3b8' }, // Slate
    { name: 'Venus', radius: 5.0, color: '#facc15' },   // Golden Yellow
    { name: 'Earth', radius: 7.0, color: '#3b82f6' },   // Blue Marble
    { name: 'Mars', radius: 9.0, color: '#ef4444' },    // Rust Red
    { name: 'Jupiter', radius: 14.0, color: '#f97316' },  // Amber Orange
    { name: 'Saturn', radius: 19.0, color: '#fef08a' }, // Saturn Gold
    { name: 'Uranus', radius: 24.0, color: '#06b6d4' }, // Cyan
    { name: 'Neptune', radius: 29.0, color: '#3b82f6' }, // Deep Blue
  ]

  const accumulatedTime = useRef(0)

  useFrame((_, delta) => {
    const simulationSpeed = useExplorerStore.getState().simulationSpeed
    // Accumulate time based on delta to prevent teleporting when speed changes
    accumulatedTime.current += delta * simulationSpeed
    const time = accumulatedTime.current

    // Rotate Sun on its axis
    if (sunRef.current) {
      sunRef.current.rotation.y += delta * 0.08 * simulationSpeed
    }

    // 1. Rotate corona & pulsating solar flare heat rays
    if (coronaRef.current) {
      coronaRef.current.material.rotation = time * 0.1
      const scale = 8.0 + Math.sin(time * 2.5) * 0.2
      coronaRef.current.scale.set(scale, scale, 1)
    }

    if (flareRef.current) {
      flareRef.current.material.rotation = -time * 0.15
      const flareScale = 11.0 + Math.cos(time * 3.0) * 0.4
      flareRef.current.scale.set(flareScale, flareScale, 1)
    }

    // 2. Light pulse
    if (lightRef.current) {
      lightRef.current.intensity = 4.0 + Math.sin(time * 4) * 0.4
    }
  })

  return (
    <group position={[0, 0, 0]}>
      {/* ☀️ Main Sun Core Glow Light */}
      <pointLight ref={lightRef} position={[0, 0, 0]} intensity={4.0} color='#fff0a0' distance={120} decay={1} />

      {/* 🌟 Sun Inner Core Mesh (Golden Glowing Mesh) - Direct Click Target */}
      <mesh
        ref={sunRef}
        position={[0, 0, 0]}
        onClick={handleSunClick}
        onPointerEnter={(e) => {
          e.stopPropagation()
          setHoveredPlanetId('sol-sun')
          document.body.style.cursor = 'pointer'
          playSound('hover')
        }}
        onPointerLeave={() => {
          setHoveredPlanetId(null)
          document.body.style.cursor = 'auto'
        }}
      >
        <sphereGeometry args={[1.6, 32, 32]} />
        <meshBasicMaterial map={sunTexture} />
      </mesh>

      {/* 🔆 High-Quality Radial Sun Glow */}
      <sprite ref={coronaRef}>
        <spriteMaterial
          map={glowTexture}
          blending={THREE.AdditiveBlending}
          transparent={true}
          depthWrite={false}
          opacity={0.8}
        />
      </sprite>

      {/* 🔥 Outer Pulsating Solar Heat Flare Halo */}
      <sprite ref={flareRef}>
        <spriteMaterial
          map={glowTexture}
          blending={THREE.AdditiveBlending}
          transparent={true}
          depthWrite={false}
          opacity={0.5}
        />
      </sprite>

      {/* ⭕ Orbital Path Rings for Solar System Planets */}
      {orbitRadii.map((orbit) => (
        <OrbitRing key={orbit.name} radius={orbit.radius} color={orbit.color} />
      ))}
    </group>
  )
}

function OrbitRing({ radius, color }: { radius: number; color: string }) {
  const points = useMemo(() => {
    const pts = []
    for (let i = 0; i <= 128; i++) {
      const angle = (i / 128) * Math.PI * 2
      pts.push(new THREE.Vector3(Math.cos(angle) * radius, 0, Math.sin(angle) * radius))
    }
    return pts
  }, [radius])

  return (
    <Line
      points={points}
      color={color}
      lineWidth={1.5}
      transparent
      opacity={0.15}
    />
  )
}
