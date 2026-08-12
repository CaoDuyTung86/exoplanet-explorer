import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'

/**
 * NebulaField — Procedural nebula sprites at the far background.
 * 
 * Uses Canvas-generated radial gradient textures (no external images needed).
 * Each nebula is a large sprite with additive blending, rotating very slowly.
 * Creates depth and "lived-in universe" feel.
 * 
 * Cost: 5 draw calls total — virtually free.
 */

const NEBULA_CONFIGS = [
  { pos: [200, 80, -350] as const, color1: '#1a0a3e', color2: '#3b1f8e', color3: '#0d0d2b', size: 250, rotSpeed: 0.003 },
  { pos: [-300, -50, -250] as const, color1: '#2e0a0a', color2: '#8e3b1f', color3: '#1a0505', size: 200, rotSpeed: -0.002 },
  { pos: [100, -120, -400] as const, color1: '#0a1a2e', color2: '#1f5f8e', color3: '#050d1a', size: 300, rotSpeed: 0.004 },
  { pos: [-200, 150, -300] as const, color1: '#1a0a2e', color2: '#6b1f8e', color3: '#0d051a', size: 220, rotSpeed: -0.003 },
  { pos: [350, -30, -200] as const, color1: '#0a2e1a', color2: '#1f8e5f', color3: '#051a0d', size: 180, rotSpeed: 0.002 },
]

function createNebulaTexture(color1: string, color2: string, color3: string): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = 256
  canvas.height = 256
  const ctx = canvas.getContext('2d')!

  // Layer 1: Large soft glow
  const g1 = ctx.createRadialGradient(128, 128, 0, 128, 128, 128)
  g1.addColorStop(0, color2 + 'aa')
  g1.addColorStop(0.3, color1 + '66')
  g1.addColorStop(0.7, color3 + '22')
  g1.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g1
  ctx.fillRect(0, 0, 256, 256)

  // Layer 2: Off-center highlight for asymmetry
  const g2 = ctx.createRadialGradient(100, 140, 0, 128, 128, 100)
  g2.addColorStop(0, color2 + '55')
  g2.addColorStop(0.5, color1 + '22')
  g2.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g2
  ctx.fillRect(0, 0, 256, 256)

  // Layer 3: Another off-center blob
  const g3 = ctx.createRadialGradient(160, 100, 0, 128, 128, 80)
  g3.addColorStop(0, color2 + '44')
  g3.addColorStop(0.6, color3 + '11')
  g3.addColorStop(1, 'rgba(0,0,0,0)')
  ctx.fillStyle = g3
  ctx.fillRect(0, 0, 256, 256)

  return new THREE.CanvasTexture(canvas)
}

function NebulaSingle({
  position,
  color1,
  color2,
  color3,
  size,
  rotSpeed,
}: {
  position: readonly [number, number, number]
  color1: string
  color2: string
  color3: string
  size: number
  rotSpeed: number
}) {
  const spriteRef = useRef<THREE.Sprite>(null)
  const texture = useMemo(() => createNebulaTexture(color1, color2, color3), [color1, color2, color3])

  useFrame((_, delta) => {
    if (spriteRef.current) {
      spriteRef.current.material.rotation += delta * rotSpeed
    }
  })

  return (
    <sprite ref={spriteRef} position={[position[0], position[1], position[2]]} scale={[size, size, 1]}>
      <spriteMaterial
        map={texture}
        transparent
        opacity={0.35}
        blending={THREE.AdditiveBlending}
        depthWrite={false}
      />
    </sprite>
  )
}

export function NebulaField() {
  return (
    <group>
      {NEBULA_CONFIGS.map((cfg, i) => (
        <NebulaSingle
          key={i}
          position={cfg.pos}
          color1={cfg.color1}
          color2={cfg.color2}
          color3={cfg.color3}
          size={cfg.size}
          rotSpeed={cfg.rotSpeed}
        />
      ))}
    </group>
  )
}
