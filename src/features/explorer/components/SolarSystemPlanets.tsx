import { useRef, useEffect } from 'react'
import { useTexture } from '@react-three/drei'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useExplorerStore } from '../stores/explorerStore'
import { currentPlanetPositions } from './PlanetCloud'
import { playSound } from '../services/audio'

const solarConfigs = [
  {
    id: 'sol-mercury',
    r: 3.5,
    speed: 0.8,
    texture: '/textures/mercury_color.jpg',
  },
  {
    id: 'sol-venus',
    r: 5.0,
    speed: 0.55,
    texture: '/textures/venus_color.jpg',
  },
  {
    id: 'sol-earth',
    r: 7.0,
    speed: 0.4,
    texture: '/textures/earth_color.jpg',
    clouds: '/textures/earth_clouds.jpg',
    specular: '/textures/earth_specular.jpg',
  },
  { id: 'sol-mars', r: 9.0, speed: 0.28, texture: '/textures/mars_color.jpg' },
  {
    id: 'sol-jupiter',
    r: 14.0,
    speed: 0.15,
    texture: '/textures/jupiter_color.jpg',
  },
  {
    id: 'sol-saturn',
    r: 19.0,
    speed: 0.08,
    texture: '/textures/saturn_color.jpg',
    ring: '/textures/saturn_ring.png',
  },
  {
    id: 'sol-uranus',
    r: 24.0,
    speed: 0.05,
    texture: '/textures/uranus_color.jpg',
  },
  {
    id: 'sol-neptune',
    r: 29.0,
    speed: 0.03,
    texture: '/textures/neptune_color.jpg',
  },
]

export function SolarSystemPlanets() {
  const planets = useExplorerStore((s) => s.planets)
  const setSelectedPlanet = useExplorerStore((s) => s.setSelectedPlanet)
  const setHoveredPlanetId = useExplorerStore((s) => s.setHoveredPlanetId)
  const hoveredPlanetId = useExplorerStore((s) => s.hoveredPlanetId)

  // Load all textures (Suspense will handle loading state)
  const textures = useTexture(
    solarConfigs.reduce<Record<string, string>>((acc, cfg) => {
      acc[cfg.id] = cfg.texture
      if (cfg.clouds) acc[cfg.id + '_clouds'] = cfg.clouds
      if (cfg.specular) acc[cfg.id + '_spec'] = cfg.specular
      if (cfg.ring) acc[cfg.id + '_ring'] = cfg.ring
      return acc
    }, {})
  )

  const groupRef = useRef<THREE.Group>(null)
  const meshesRef = useRef<Record<string, THREE.Group | null>>({})
  const accumulatedTime = useRef(0)

  useFrame((_, delta) => {
    const simulationSpeed = useExplorerStore.getState().simulationSpeed
    accumulatedTime.current += delta * simulationSpeed
    const time = accumulatedTime.current

    solarConfigs.forEach((cfg) => {
      const group = meshesRef.current[cfg.id]
      if (group) {
        const angle = time * cfg.speed
        const posX = Math.cos(angle) * cfg.r
        const posZ = Math.sin(angle) * cfg.r

        group.position.set(posX, 0, posZ)
        group.rotation.y += delta * 0.5 * simulationSpeed

        // Update tracking map for Camera/Tooltip
        currentPlanetPositions.set(cfg.id, new THREE.Vector3(posX, 0, posZ))
      }
    })
  })

  return (
    <group ref={groupRef}>
      {solarConfigs.map((cfg) => {
        const planetData = planets.find((p) => p.id === cfg.id)
        if (!planetData) return null

        const isHovered = hoveredPlanetId === cfg.id
        const scaleMultiplier = isHovered ? 1.15 : 1.0
        const radius = planetData.visualRadius * scaleMultiplier

        return (
          <group 
            key={cfg.id}
            ref={(el) => (meshesRef.current[cfg.id] = el)}
            onClick={(e) => {
              e.stopPropagation()
              setSelectedPlanet(planetData)
              playSound('click')
            }}
            onPointerEnter={(e) => {
              e.stopPropagation()
              setHoveredPlanetId(cfg.id)
              document.body.style.cursor = 'pointer'
              playSound('hover')
            }}
            onPointerLeave={() => {
              setHoveredPlanetId(null)
              document.body.style.cursor = 'auto'
            }}
          >
            {/* Core Planet Mesh */}
            <mesh>
              <sphereGeometry args={[radius, 32, 32]} />
              <meshPhongMaterial
                map={textures[cfg.id]}
                specularMap={
                  cfg.specular ? textures[cfg.id + '_spec'] : undefined
                }
                shininess={cfg.specular ? 15 : 5}
              />
            </mesh>

            {/* Earth Cloud Layer */}
            {cfg.clouds && (
              <mesh scale={1.01}>
                <sphereGeometry args={[radius, 32, 32]} />
                <meshPhongMaterial
                  map={textures[cfg.id + '_clouds']}
                  transparent={true}
                  opacity={0.4}
                  blending={THREE.AdditiveBlending}
                  depthWrite={false}
                />
              </mesh>
            )}

            {/* Saturn Ring Layer (P2.2) */}
            {cfg.ring && (
              <SaturnRing radius={radius} texture={textures[cfg.id + '_ring']} />
            )}
          </group>
        )
      })}
    </group>
  )
}

function SaturnRing({ radius, texture }: { radius: number; texture: THREE.Texture }) {
  const innerR = radius * 1.4
  const outerR = radius * 2.4
  
  const geoRef = useRef<THREE.RingGeometry>(null)

  useEffect(() => {
    if (geoRef.current) {
      const pos = geoRef.current.attributes.position
      const uv = geoRef.current.attributes.uv
      
      for (let i = 0; i < pos.count; i++) {
        const x = pos.getX(i)
        const y = pos.getY(i)
        const r = Math.sqrt(x * x + y * y)
        
        // Map radius to U (x-axis of the 2048x125 texture strip)
        // Use 1 - u or u depending on texture orientation. Usually 0 is inner.
        // Actually, for solar system scope, left is inner ring.
        const u = (r - innerR) / (outerR - innerR)
        
        // Map angle to V
        const v = (Math.atan2(y, x) + Math.PI) / (2 * Math.PI)
        
        uv.setXY(i, u, v)
      }
      uv.needsUpdate = true
    }
  }, [innerR, outerR])

  return (
    <mesh rotation={[Math.PI / 2 + 0.3, 0, 0]}>
      <ringGeometry ref={geoRef} args={[innerR, outerR, 64]} />
      <meshBasicMaterial
        map={texture}
        transparent={true}
        opacity={0.8}
        side={THREE.DoubleSide}
      />
    </mesh>
  )
}
