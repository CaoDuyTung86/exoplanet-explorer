/**
 * Generates the app icon set as real PNG files — no ffmpeg, no sharp, no network.
 *
 * The previous public/pwa-*.png files were a 2048x1024 JPEG (a banner screenshot)
 * renamed to .png, byte-identical across both sizes, so PWA installs and the
 * apple-touch-icon were both broken. This renders a proper ringed-planet mark
 * procedurally and encodes it with a minimal pure-Node PNG writer.
 *
 * Run: node scripts/generate_icons.cjs
 */

const fs = require('fs')
const path = require('path')
const zlib = require('zlib')

const outDir = path.join(__dirname, '..', 'public')

// ---------------------------------------------------------------- PNG writer

const CRC_TABLE = (() => {
  const table = new Int32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    table[n] = c
  }
  return table
})()

function crc32(buf) {
  let c = 0xffffffff
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

function chunk(type, data) {
  const len = Buffer.alloc(4)
  len.writeUInt32BE(data.length)
  const body = Buffer.concat([Buffer.from(type, 'ascii'), data])
  const crc = Buffer.alloc(4)
  crc.writeUInt32BE(crc32(body))
  return Buffer.concat([len, body, crc])
}

/** @param {Buffer} rgba raw width*height*4 bytes */
function encodePng(width, height, rgba) {
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8 // bit depth
  ihdr[9] = 6 // colour type: RGBA
  ihdr[10] = 0 // deflate
  ihdr[11] = 0 // adaptive filtering
  ihdr[12] = 0 // no interlace

  // Each scanline is prefixed with filter type 0 (None).
  const raw = Buffer.alloc(height * (width * 4 + 1))
  for (let y = 0; y < height; y++) {
    raw[y * (width * 4 + 1)] = 0
    rgba.copy(raw, y * (width * 4 + 1) + 1, y * width * 4, (y + 1) * width * 4)
  }

  return Buffer.concat([
    Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    chunk('IHDR', ihdr),
    chunk('IDAT', zlib.deflateSync(raw, { level: 9 })),
    chunk('IEND', Buffer.alloc(0)),
  ])
}

// ------------------------------------------------------------------ drawing

const BG = [2, 6, 23] // slate-950, matches manifest theme_color #020617
const RING = [103, 232, 249] // cyan-300
const LIT = [56, 189, 248] // sky-400
const DARK = [12, 47, 90]

const lerp = (a, b, t) => a + (b - a) * t
const mix = (c1, c2, t) => [lerp(c1[0], c2[0], t), lerp(c1[1], c2[1], t), lerp(c1[2], c2[2], t)]

/** Deterministic starfield so every regeneration produces the same icon. */
function makeStars(count) {
  let seed = 0x5eed1234
  const rand = () => {
    seed = (seed * 1664525 + 1013904223) >>> 0
    return seed / 0x100000000
  }
  const stars = []
  while (stars.length < count) {
    const x = rand()
    const y = rand()
    // Keep the field clear of the planet/ring so the mark stays readable.
    if (Math.hypot(x - 0.5, y - 0.5) < 0.44) continue
    stars.push({ x, y, r: 0.004 + rand() * 0.008, a: 0.35 + rand() * 0.5 })
  }
  return stars
}

const STARS = makeStars(26)

const RING_TILT = -0.42 // radians
const RING_FLATTEN = 0.32
const RING_INNER = 0.3
const RING_OUTER = 0.385
const PLANET_R = 0.225

/** Colour at normalised coords (0..1). Returns [r,g,b] — the icon is fully opaque. */
function sample(nx, ny) {
  let col = BG

  for (const s of STARS) {
    const d = Math.hypot(nx - s.x, ny - s.y)
    if (d < s.r) col = mix(col, [226, 232, 240], s.a * (1 - d / s.r))
  }

  const dx = nx - 0.5
  const dy = ny - 0.5

  // Ring in the tilted frame.
  const cos = Math.cos(RING_TILT)
  const sin = Math.sin(RING_TILT)
  const u = dx * cos + dy * sin
  const v = (-dx * sin + dy * cos) / RING_FLATTEN
  const ringR = Math.hypot(u, v)
  const onRing = ringR > RING_INNER && ringR < RING_OUTER
  // Fade the ring toward its inner and outer edges.
  const ringA = onRing
    ? 0.9 * Math.min(1, (ringR - RING_INNER) / 0.03) * Math.min(1, (RING_OUTER - ringR) / 0.03)
    : 0

  const planetD = Math.hypot(dx, dy)
  const inFront = dy > 0 // near half of the ring passes over the planet

  if (ringA > 0 && !inFront) col = mix(col, RING, ringA)

  if (planetD < PLANET_R) {
    // Cheap sphere shading: light from the upper left.
    const z = Math.sqrt(Math.max(0, PLANET_R * PLANET_R - planetD * planetD)) / PLANET_R
    const light = Math.max(0, (-dx / PLANET_R) * 0.55 + (-dy / PLANET_R) * 0.5 + z * 0.7)
    col = mix(DARK, LIT, Math.min(1, light))
    // Rim light along the terminator edge.
    const rim = Math.pow(planetD / PLANET_R, 8)
    col = mix(col, RING, rim * 0.5)
  }

  if (ringA > 0 && inFront) col = mix(col, RING, ringA)

  return col
}

function render(size) {
  const rgba = Buffer.alloc(size * size * 4)
  const SS = 3 // supersampling factor per axis
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      let r = 0
      let g = 0
      let b = 0
      for (let sy = 0; sy < SS; sy++) {
        for (let sx = 0; sx < SS; sx++) {
          const c = sample((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size)
          r += c[0]
          g += c[1]
          b += c[2]
        }
      }
      const n = SS * SS
      const i = (y * size + x) * 4
      rgba[i] = Math.round(r / n)
      rgba[i + 1] = Math.round(g / n)
      rgba[i + 2] = Math.round(b / n)
      rgba[i + 3] = 255
    }
  }
  return encodePng(size, size, rgba)
}

const targets = [
  ['pwa-192x192.png', 192],
  ['pwa-512x512.png', 512],
  ['apple-touch-icon.png', 180],
  ['favicon-32.png', 32],
]

for (const [name, size] of targets) {
  const png = render(size)
  fs.writeFileSync(path.join(outDir, name), png)
  console.log(`${name.padEnd(22)} ${size}x${size}  ${(png.length / 1024).toFixed(1)} KB`)
}
