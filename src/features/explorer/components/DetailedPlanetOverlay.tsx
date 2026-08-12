import { useRef, useMemo } from 'react'
import { useFrame } from '@react-three/fiber'
import * as THREE from 'three'
import { useExplorerStore } from '../stores/explorerStore'
import { getPlanetWorldPosition } from './PlanetCloud'

// -- Simplex 3D Noise GLSL --
const noiseGLSL = `
// Simplex 3D Noise by Ian McEwan, Ashima Arts
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
float snoise(vec3 v){ 
  const vec2  C = vec2(1.0/6.0, 1.0/3.0) ;
  const vec4  D = vec4(0.0, 0.5, 1.0, 2.0);
  vec3 i  = floor(v + dot(v, C.yyy) );
  vec3 x0 = v - i + dot(i, C.xxx) ;
  vec3 g = step(x0.yzx, x0.xyz);
  vec3 l = 1.0 - g;
  vec3 i1 = min( g.xyz, l.zxy );
  vec3 i2 = max( g.xyz, l.zxy );
  vec3 x1 = x0 - i1 + 1.0 * C.xxx;
  vec3 x2 = x0 - i2 + 2.0 * C.xxx;
  vec3 x3 = x0 - 1.0 + 3.0 * C.xxx;
  i = mod(i, 289.0 ); 
  vec4 p = permute( permute( permute( 
             i.z + vec4(0.0, i1.z, i2.z, 1.0 ))
           + i.y + vec4(0.0, i1.y, i2.y, 1.0 )) 
           + i.x + vec4(0.0, i1.x, i2.x, 1.0 ));
  float n_ = 1.0/7.0;
  vec3  ns = n_ * D.wyz - D.xzx;
  vec4 j = p - 49.0 * floor(p * ns.z *ns.z);
  vec4 x_ = floor(j * ns.z);
  vec4 y_ = floor(j - 7.0 * x_ );
  vec4 x = x_ *ns.x + ns.yyyy;
  vec4 y = y_ *ns.x + ns.yyyy;
  vec4 h = 1.0 - abs(x) - abs(y);
  vec4 b0 = vec4( x.xy, y.xy );
  vec4 b1 = vec4( x.zw, y.zw );
  vec4 s0 = floor(b0)*2.0 + 1.0;
  vec4 s1 = floor(b1)*2.0 + 1.0;
  vec4 sh = -step(h, vec4(0.0));
  vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy ;
  vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww ;
  vec3 p0 = vec3(a0.xy,h.x);
  vec3 p1 = vec3(a0.zw,h.y);
  vec3 p2 = vec3(a1.xy,h.z);
  vec3 p3 = vec3(a1.zw,h.w);
  vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2, p2), dot(p3,p3)));
  p0 *= norm.x;
  p1 *= norm.y;
  p2 *= norm.z;
  p3 *= norm.w;
  vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
  m = m * m;
  return 42.0 * dot( m*m, vec4( dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3) ) );
}
`

// ----------------------------------------------------
// SHADER: Gas Giant (Swirling horizontal bands)
// ----------------------------------------------------
const gasVertexShader = `
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;
void main() {
  vNormal = normalize(normalMatrix * normal);
  vPosition = position;
  vec4 worldPosition = modelMatrix * vec4(position, 1.0);
  vWorldPosition = worldPosition.xyz;
  gl_Position = projectionMatrix * viewMatrix * worldPosition;
}
`

const gasFragmentShader = `
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uSunDirection;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;

${noiseGLSL}

void main() {
  // Gas giant bands
  vec3 pos = vPosition * 4.0;
  
  // Create swirling effect by combining Y position with noise
  float n1 = snoise(vec3(pos.x, pos.y * 2.0 + uTime * 0.2, pos.z + uTime * 0.1));
  float n2 = snoise(vec3(pos.x * 2.0, pos.y * 10.0, pos.z * 2.0)); // fine details
  
  // Combine horizontal bands (y) with noise
  float band = sin(pos.y * 5.0 + n1 * 2.0) * 0.5 + 0.5;
  band = mix(band, n2 * 0.5 + 0.5, 0.3);

  vec3 baseColor = mix(uColor1, uColor2, smoothstep(0.2, 0.8, band));
  
  // Simple diffuse lighting from sun
  float diff = max(dot(normalize(vNormal), normalize(uSunDirection)), 0.0);
  
  // Ambient light + Diffuse
  vec3 finalColor = baseColor * (diff * 0.8 + 0.2);

  // Atmospheric rim glow
  float rim = 1.0 - max(dot(normalize(cameraPosition - vWorldPosition), normalize(vNormal)), 0.0);
  finalColor += uColor2 * pow(rim, 3.0) * 0.5;

  gl_FragColor = vec4(finalColor, 1.0);
}
`

// ----------------------------------------------------
// SHADER: Lava Planet (Dark crust with glowing cracks)
// ----------------------------------------------------
const lavaFragmentShader = `
uniform float uTime;
uniform vec3 uColor1; // Glow color (Red/Orange)
uniform vec3 uColor2; // Crust color (Dark grey)
uniform vec3 uSunDirection;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;

${noiseGLSL}

void main() {
  vec3 pos = vPosition * 8.0;
  
  // Evolving noise for magma flow
  float n = snoise(vec3(pos.x + uTime * 0.1, pos.y, pos.z + uTime * 0.05));
  float n2 = snoise(pos * 2.0);
  
  // Create cracks using absolute value of noise (ridged noise)
  float crack = 1.0 - abs(n);
  crack = pow(crack, 6.0); // Sharpen cracks
  crack *= (n2 * 0.5 + 0.5); // Break up cracks
  
  vec3 baseColor = mix(uColor2, uColor1, crack);
  
  // Diffuse light (only affects crust, cracks glow intrinsically)
  float diff = max(dot(normalize(vNormal), normalize(uSunDirection)), 0.0);
  
  vec3 finalColor = uColor2 * (diff * 0.7 + 0.1);
  // Add unlit glowing cracks
  finalColor += uColor1 * crack * 1.5;

  gl_FragColor = vec4(finalColor, 1.0);
}
`

// ----------------------------------------------------
// SHADER: Rocky/Ice Planet (Bump noise)
// ----------------------------------------------------
const rockyFragmentShader = `
uniform float uTime;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uSunDirection;
varying vec3 vNormal;
varying vec3 vPosition;
varying vec3 vWorldPosition;

${noiseGLSL}

void main() {
  vec3 pos = vPosition * 6.0;
  
  float n = snoise(pos);
  float n2 = snoise(pos * 4.0);
  
  float terrain = n * 0.5 + n2 * 0.2;
  
  vec3 baseColor = mix(uColor1, uColor2, terrain * 0.5 + 0.5);
  
  // Fake bump mapping normal perturbation
  vec3 perturbedNormal = normalize(vNormal + vec3(n2, n, n2) * 0.1);
  
  float diff = max(dot(perturbedNormal, normalize(uSunDirection)), 0.0);
  
  vec3 finalColor = baseColor * (diff * 0.8 + 0.2);

  gl_FragColor = vec4(finalColor, 1.0);
}
`

// ----------------------------------------------------
// REACT COMPONENT
// ----------------------------------------------------
export function DetailedPlanetOverlay() {
  const selectedPlanet = useExplorerStore((s) => s.selectedPlanet)
  const groupRef = useRef<THREE.Group>(null)
  const materialRef = useRef<THREE.ShaderMaterial>(null)

  // Determine Shader Type
  const shaderType = useMemo(() => {
    if (!selectedPlanet) return 'rocky'
    const cat = selectedPlanet.sizeCategory.toLowerCase()
    if (cat.includes('giant') || cat.includes('neptune')) {
      return 'gas'
    }
    if (selectedPlanet.pl_eqt && selectedPlanet.pl_eqt > 800) {
      return 'lava'
    }
    return 'rocky'
  }, [selectedPlanet])

  // Get Colors
  const colors = useMemo(() => {
    if (!selectedPlanet) return { c1: '#ffffff' as THREE.ColorRepresentation, c2: '#aaaaaa' as THREE.ColorRepresentation }
    if (shaderType === 'lava') return { c1: '#ff3300' as THREE.ColorRepresentation, c2: '#1a1a1a' as THREE.ColorRepresentation } // Glow Red, Crust Black
    if (shaderType === 'gas') {
      const c1 = Array.isArray(selectedPlanet.color) ? new THREE.Color(selectedPlanet.color[0], selectedPlanet.color[1], selectedPlanet.color[2]) : selectedPlanet.color
      return { c1, c2: '#ffffff' as THREE.ColorRepresentation }
    }
    const c1 = Array.isArray(selectedPlanet.color) ? new THREE.Color(selectedPlanet.color[0], selectedPlanet.color[1], selectedPlanet.color[2]) : selectedPlanet.color
    return { c1, c2: '#aaaaaa' as THREE.ColorRepresentation } // Rocky
  }, [selectedPlanet, shaderType])

  // Shader Uniforms
  const uniforms = useMemo(() => ({
    uTime: { value: 0 },
    uColor1: { value: new THREE.Color(colors.c1) },
    uColor2: { value: new THREE.Color(colors.c2) },
    uSunDirection: { value: new THREE.Vector3(1, 0, 0) }, // Will be updated dynamically
  }), [colors])

  // Track the planet position
  useFrame((state) => {
    if (groupRef.current && selectedPlanet) {
      const worldPos = getPlanetWorldPosition(selectedPlanet.id)
      if (worldPos) {
        groupRef.current.position.copy(worldPos)
        
        // Update Sun Direction (Sun is at 0,0,0 so vector is -worldPos)
        if (materialRef.current) {
          const sunDir = new THREE.Vector3().copy(worldPos).negate().normalize()
          materialRef.current.uniforms.uSunDirection.value.copy(sunDir)
          materialRef.current.uniforms.uTime.value = state.clock.elapsedTime
        }
      }
    }
  })

  if (!selectedPlanet || selectedPlanet.id.startsWith('sol-')) return null

  // Fragment shader choice
  let fragShader = rockyFragmentShader
  if (shaderType === 'gas') fragShader = gasFragmentShader
  if (shaderType === 'lava') fragShader = lavaFragmentShader

  // Render slightly larger than the InstancedMesh instance so it perfectly covers it
  // InstancedMesh scale was `visualRadius`, we use `visualRadius * 1.02`
  const overlayRadius = selectedPlanet.visualRadius * 1.02

  return (
    <group ref={groupRef}>
      <mesh>
        <sphereGeometry args={[overlayRadius, 64, 64]} />
        <shaderMaterial
          ref={materialRef}
          vertexShader={gasVertexShader}
          fragmentShader={fragShader}
          uniforms={uniforms}
          transparent={false}
        />
      </mesh>
    </group>
  )
}
