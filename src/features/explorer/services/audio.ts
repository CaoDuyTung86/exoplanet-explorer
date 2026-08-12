import { Howl, Howler } from 'howler'
import { ambientSynth } from './ambientSynth'

export const SOUNDS = {
  click: new Howl({ src: ['/sounds/click.wav'], volume: 0.6 }),
  hover: new Howl({ src: ['/sounds/hover.wav'], volume: 0.0 }),
  woosh: new Howl({ src: ['/sounds/woosh.wav'], volume: 0.15 }),
  bgm: new Howl({ src: ['/sounds/bgm.wav'], volume: 0.1, loop: true, html5: true }),
}

let globalMuted = false

export function playSound(sound: keyof typeof SOUNDS) {
  if (Howler.ctx?.state === 'suspended') {
    Howler.ctx.resume()
  }
  if (SOUNDS[sound]) {
    SOUNDS[sound].play()
  }
}

export function playBgm() {
  if (Howler.ctx?.state === 'suspended') {
    Howler.ctx.resume()
  }
  if (!SOUNDS.bgm.playing()) {
    SOUNDS.bgm.play()
  }
}

export function pauseBgm() {
  SOUNDS.bgm.pause()
}

export function setBgmVolume(volume: number) {
  if (SOUNDS.bgm) {
    SOUNDS.bgm.volume(volume)
  }
}

export function toggleAudioMute(mute?: boolean) {
  globalMuted = mute ?? !globalMuted
  Howler.mute(globalMuted)
  ambientSynth.mute(globalMuted)
  return globalMuted
}

export function isAudioMuted() {
  return globalMuted
}
