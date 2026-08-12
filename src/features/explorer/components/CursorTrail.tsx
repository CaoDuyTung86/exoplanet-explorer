import { useRef } from 'react'
import { useFrame, useThree } from '@react-three/fiber'
import { Trail } from '@react-three/drei'
import * as THREE from 'three'

/**
 * CursorTrail — Cosmic dust trail that follows the mouse cursor in 3D space.
 * 
 * Uses @react-three/drei's Trail component for a continuous, smooth line
 * that perfectly fades out without separating into dots when moving fast.
 */
export function CursorTrail() {
  const meshRef = useRef<THREE.Mesh>(null)
  const { camera } = useThree()
  const targetPos = useRef(new THREE.Vector3())

  useFrame((state) => {
    if (!meshRef.current) return
    const pointer = state.pointer
    
    // Project mouse to world space on a plane slightly in front of the camera
    const vec = new THREE.Vector3(pointer.x, pointer.y, 0.5)
    vec.unproject(camera)
    const dir = vec.sub(camera.position).normalize()
    const dist = 15 // Distance from camera
    
    targetPos.current.copy(camera.position).add(dir.multiplyScalar(dist))
    
    // Lerp position for extra smoothness, or just set it directly
    meshRef.current.position.lerp(targetPos.current, 0.5)
  })

  return (
    <>
      {/* The invisible object that follows the cursor */}
      <mesh ref={meshRef} visible={false}>
        <sphereGeometry args={[0.01]} />
        <meshBasicMaterial />
      </mesh>

      {/* The continuous trail left behind the object */}
      <Trail
        width={0.2}
        color={'#66ccff'}
        length={20}
        decay={1.5}
        local={false}
        stride={0}
        interval={1}
        target={meshRef as unknown as React.RefObject<THREE.Object3D>}
        attenuation={(width) => width}
      >
        <meshBasicMaterial color="#66ccff" transparent opacity={0.6} blending={THREE.AdditiveBlending} depthWrite={false} />
      </Trail>
    </>
  )
}
