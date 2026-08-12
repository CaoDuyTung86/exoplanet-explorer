import { useMemo } from 'react'
import * as THREE from 'three'

/**
 * AtmosphereGlow — Fresnel rim-glow shader that wraps a planet mesh.
 * Only the edges glow (view-dependent), simulating atmospheric scattering.
 * 
 * Uses additive blending + backface rendering so it never occludes the planet surface.
 */

const atmosphereVertexShader = `
varying vec3 vNormal;
varying vec3 vViewDir;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vec4 worldPos = modelMatrix * vec4(position, 1.0);
  vViewDir = normalize(cameraPosition - worldPos.xyz);
  gl_Position = projectionMatrix * viewMatrix * worldPos;
}
`

const atmosphereFragmentShader = `
uniform vec3 uGlowColor;
uniform float uIntensity;
uniform float uPower;
varying vec3 vNormal;
varying vec3 vViewDir;

void main() {
  // Fresnel effect — bright at edges, transparent at center
  float fresnel = 1.0 - dot(vViewDir, vNormal);
  fresnel = pow(max(fresnel, 0.0), uPower);
  
  gl_FragColor = vec4(uGlowColor, fresnel * uIntensity);
}
`

interface AtmosphereGlowProps {
  radius: number
  color?: string
  intensity?: number
  power?: number
  scale?: number
}

export function AtmosphereGlow({
  radius,
  color = '#4da6ff',
  intensity = 0.6,
  power = 4.5,
  scale = 1.08,
}: AtmosphereGlowProps) {
  const uniforms = useMemo(
    () => ({
      uGlowColor: { value: new THREE.Color(color) },
      uIntensity: { value: intensity },
      uPower: { value: power },
    }),
    [color, intensity, power]
  )

  return (
    <mesh scale={scale}>
      <sphereGeometry args={[radius, 32, 32]} />
      <shaderMaterial
        vertexShader={atmosphereVertexShader}
        fragmentShader={atmosphereFragmentShader}
        uniforms={uniforms}
        transparent
        blending={THREE.AdditiveBlending}
        side={THREE.BackSide}
        depthWrite={false}
      />
    </mesh>
  )
}
