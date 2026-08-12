/**
 * Generates real minimal MP3 files using the MP3 frame format.
 * Each file is a valid, browser-playable MP3 with pure tone generated in raw PCM -> encoded via lookup.
 * Uses pure Node.js Buffer — no ffmpeg, no network required.
 */

const fs = require('fs')
const path = require('path')

const outputDir = path.join(__dirname, '..', 'public', 'sounds')

// --- MP3 Frame Generator (MPEG1, Layer3, 128kbps, 44100Hz, Stereo) ---
// We'll use the WAV format instead since it's simpler to generate without an MP3 encoder.
// Browsers support WAV natively.

function writeWavFile(filename, durationSec, generateSamples) {
  const sampleRate = 44100
  const numChannels = 1
  const bitsPerSample = 16
  const numSamples = Math.floor(sampleRate * durationSec)
  
  const dataSize = numSamples * numChannels * (bitsPerSample / 8)
  const buffer = Buffer.alloc(44 + dataSize)
  
  // WAV Header
  buffer.write('RIFF', 0)
  buffer.writeUInt32LE(36 + dataSize, 4)
  buffer.write('WAVE', 8)
  buffer.write('fmt ', 12)
  buffer.writeUInt32LE(16, 16) // PCM chunk size
  buffer.writeUInt16LE(1, 20)  // PCM format
  buffer.writeUInt16LE(numChannels, 22)
  buffer.writeUInt32LE(sampleRate, 24)
  buffer.writeUInt32LE(sampleRate * numChannels * bitsPerSample / 8, 28)
  buffer.writeUInt16LE(numChannels * bitsPerSample / 8, 32)
  buffer.writeUInt16LE(bitsPerSample, 34)
  buffer.write('data', 36)
  buffer.writeUInt32LE(dataSize, 40)
  
  // Generate samples
  for (let i = 0; i < numSamples; i++) {
    const t = i / sampleRate
    const sample = generateSamples(t, durationSec)
    const clamped = Math.max(-1, Math.min(1, sample))
    const int16 = Math.floor(clamped * 32767)
    buffer.writeInt16LE(int16, 44 + i * 2)
  }
  
  fs.writeFileSync(path.join(outputDir, filename), buffer)
  console.log(`Generated ${filename} (${(buffer.length / 1024).toFixed(1)} KB)`)
}

// 1. hover.wav — short high beep (800Hz, 0.08s)
writeWavFile('hover.wav', 0.08, (t, dur) => {
  const env = Math.exp(-t * 40) // fast decay
  return Math.sin(2 * Math.PI * 800 * t) * env * 0.4
})

// 2. click.wav — sharp click with a mid-freq punch (300Hz, 0.12s)
writeWavFile('click.wav', 0.12, (t, dur) => {
  const env = Math.exp(-t * 35)
  return (
    Math.sin(2 * Math.PI * 300 * t) * 0.5 +
    Math.sin(2 * Math.PI * 600 * t) * 0.2
  ) * env
})

// 3. woosh.wav — sci-fi sweep (pitch rises 200->2000Hz, 0.5s)
writeWavFile('woosh.wav', 0.5, (t, dur) => {
  const freq = 200 + (2000 - 200) * (t / dur)
  const env = t < 0.1 ? t / 0.1 : Math.exp(-(t - 0.1) * 5)
  return Math.sin(2 * Math.PI * freq * t) * env * 0.3
})

// 4. bgm.wav — deep space drone (40+60+80Hz low hum with slow tremolo, 20s)
writeWavFile('bgm.wav', 20, (t, dur) => {
  const tremolo = 0.6 + 0.4 * Math.sin(2 * Math.PI * 0.2 * t)
  const fade = t < 2 ? t / 2 : (t > 18 ? (20 - t) / 2 : 1)
  return (
    Math.sin(2 * Math.PI * 40 * t) * 0.4 +
    Math.sin(2 * Math.PI * 60 * t) * 0.3 +
    Math.sin(2 * Math.PI * 80 * t) * 0.2 +
    Math.sin(2 * Math.PI * 120 * t) * 0.1
  ) * tremolo * fade * 0.15
})

console.log('\n✅ All sound files generated successfully!')
console.log('📁 Update audio.ts to use .wav extensions instead of .mp3')
