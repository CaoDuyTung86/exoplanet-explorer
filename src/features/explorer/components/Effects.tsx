import { Bloom, EffectComposer, Vignette } from '@react-three/postprocessing'
import { BlendFunction } from 'postprocessing'

/**
 * Effects — Cinematic post-processing pipeline.
 * 
 * Bloom: Only bright objects (threshold 0.6) emit glow — Sun, bright stars, habitable zone ring.
 * Vignette: Subtle darkened edges → "telescope viewport" feel.
 * 
 * Total cost: ~2-3ms/frame on mid-range GPU.
 */
export function Effects() {
  return (
    <EffectComposer multisampling={0}>
      <Bloom
        intensity={0.8}
        luminanceThreshold={0.6}
        luminanceSmoothing={0.3}
        mipmapBlur
      />
      <Vignette
        offset={0.3}
        darkness={0.7}
        blendFunction={BlendFunction.NORMAL}
      />
    </EffectComposer>
  )
}
