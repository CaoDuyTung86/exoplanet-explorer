import { Howler } from 'howler'
import { isAudioMuted, setBgmVolume } from './audio'
import type { ProcessedPlanet } from '../types'

class AmbientSynth {
  private ctx: AudioContext | null = null
  private mainGain: GainNode | null = null
  private osc1: OscillatorNode | null = null
  private osc2: OscillatorNode | null = null
  private filter: BiquadFilterNode | null = null
  private lfo: OscillatorNode | null = null
  private lfoGain: GainNode | null = null
  private isPlaying = false

  private init() {
    if (this.ctx) return
    // Reuse Howler's context if available to respect global audio rules
    this.ctx = Howler.ctx as AudioContext || new AudioContext()
    
    // Main Volume Control
    this.mainGain = this.ctx.createGain()
    this.mainGain.gain.value = 0
    this.mainGain.connect(this.ctx.destination)

    // Filter
    this.filter = this.ctx.createBiquadFilter()
    this.filter.type = 'lowpass'
    this.filter.Q.value = 2 // Slight resonance
    this.filter.connect(this.mainGain)

    // LFO for pulsing effect (Tremolo / Filter modulation)
    this.lfo = this.ctx.createOscillator()
    this.lfo.type = 'sine'
    this.lfo.frequency.value = 0.1 // 1 cycle per 10 seconds
    
    this.lfoGain = this.ctx.createGain()
    this.lfoGain.gain.value = 100 // Modulation depth
    this.lfo.connect(this.lfoGain)
    this.lfoGain.connect(this.filter.frequency)
    this.lfo.start()

    // Oscillators
    this.osc1 = this.ctx.createOscillator()
    this.osc1.type = 'sawtooth'
    this.osc1.connect(this.filter)
    this.osc1.start()

    this.osc2 = this.ctx.createOscillator()
    this.osc2.type = 'sine'
    this.osc2.connect(this.filter)
    this.osc2.start()
  }

  public playPlanetDrone(planet: ProcessedPlanet) {
    if (isAudioMuted()) return
    this.init()

    if (!this.ctx || !this.mainGain || !this.filter || !this.osc1 || !this.osc2 || !this.lfo) return
    
    if (this.ctx.state === 'suspended') {
      this.ctx.resume()
    }

    const now = this.ctx.currentTime

    // Calculate parameters based on planet data
    // Radius -> Pitch (Bigger planet = lower pitch)
    const radius = planet.pl_rade || 1.0
    // Map radius 0.5 - 20 to frequency 80Hz - 30Hz
    const freq = Math.max(30, 80 - (radius * 2.5)) 
    
    // Temperature -> Filter Cutoff (Hotter = brighter, higher cutoff)
    const temp = planet.pl_eqt || 300
    // Map temp 100K - 3000K to filter 100Hz - 800Hz
    const cutoff = Math.min(800, Math.max(100, temp * 0.3))

    // Set values with smooth glide
    this.osc1.frequency.setTargetAtTime(freq, now, 0.5)
    this.osc2.frequency.setTargetAtTime(freq * 0.5, now, 0.5) // Sub-octave sine
    this.filter.frequency.setTargetAtTime(cutoff, now, 0.5)
    
    // LFO speed based on temperature
    this.lfo.frequency.setTargetAtTime(Math.max(0.05, temp / 2000), now, 1.0)

    // Fade in
    this.isPlaying = true
    this.mainGain.gain.cancelScheduledValues(now)
    this.mainGain.gain.setTargetAtTime(0.15, now, 1.5) // Volume 0.15

    // Phase 9.7: Heartbeat for habitable planets — "life detected" feel
    this.stopHeartbeat()
    if (planet.isHabitable) {
      this.startHeartbeat()
    }

    // Phase 9.7: Duck BGM volume when spectating
    this.duckBGM(true)
  }

  public stop() {
    if (!this.isPlaying || !this.ctx || !this.mainGain) return
    const now = this.ctx.currentTime
    this.mainGain.gain.cancelScheduledValues(now)
    this.mainGain.gain.setTargetAtTime(0.0, now, 1.0)
    this.isPlaying = false
    this.stopHeartbeat()
    this.duckBGM(false) // Restore BGM volume
  }

  public mute(isMuted: boolean) {
    if (!this.ctx || !this.mainGain) return
    const now = this.ctx.currentTime
    if (isMuted) {
      this.mainGain.gain.cancelScheduledValues(now)
      this.mainGain.gain.setTargetAtTime(0, now, 0.5)
      this.stopHeartbeat()
    } else if (this.isPlaying) {
      this.mainGain.gain.cancelScheduledValues(now)
      this.mainGain.gain.setTargetAtTime(0.15, now, 0.5)
    }
  }

  // --- Phase 9.7: Heartbeat for habitable planets ---
  private heartbeatInterval: ReturnType<typeof setInterval> | null = null

  private startHeartbeat() {
    if (!this.ctx || !this.mainGain) return

    // Double-beat pattern: thump-thump ... thump-thump
    const playBeat = () => {
      if (!this.ctx || !this.mainGain || isAudioMuted()) return
      const now = this.ctx.currentTime

      // First beat
      const osc = this.ctx.createOscillator()
      osc.type = 'sine'
      osc.frequency.value = 45

      const gain = this.ctx.createGain()
      gain.gain.setValueAtTime(0, now)
      gain.gain.linearRampToValueAtTime(0.08, now + 0.05)
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.2)

      osc.connect(gain)
      gain.connect(this.mainGain!)
      osc.start(now)
      osc.stop(now + 0.25)

      // Second beat (slightly quieter, slightly delayed)
      const osc2 = this.ctx.createOscillator()
      osc2.type = 'sine'
      osc2.frequency.value = 40

      const gain2 = this.ctx.createGain()
      gain2.gain.setValueAtTime(0, now + 0.25)
      gain2.gain.linearRampToValueAtTime(0.05, now + 0.3)
      gain2.gain.exponentialRampToValueAtTime(0.001, now + 0.45)

      osc2.connect(gain2)
      gain2.connect(this.mainGain!)
      osc2.start(now + 0.25)
      osc2.stop(now + 0.5)
    }

    playBeat()
    this.heartbeatInterval = setInterval(playBeat, 1200) // ~50 BPM
  }

  private stopHeartbeat() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval)
      this.heartbeatInterval = null
    }
  }

  // --- Phase 9.7: Dynamic BGM volume ducking ---
  private duckBGM(duck: boolean) {
    setBgmVolume(duck ? 0.03 : 0.1)
  }
}

export const ambientSynth = new AmbientSynth()
