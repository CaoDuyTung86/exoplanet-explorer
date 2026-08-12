const fs = require('fs')
const https = require('https')
const path = require('path')

const textures = [
  { name: 'earth_color.jpg', url: 'https://www.solarsystemscope.com/textures/download/2k_earth_daymap.jpg' },
  { name: 'earth_clouds.jpg', url: 'https://www.solarsystemscope.com/textures/download/2k_earth_clouds.jpg' },
  { name: 'earth_specular.jpg', url: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_specular_2048.jpg' },
  { name: 'earth_normal.jpg', url: 'https://raw.githubusercontent.com/mrdoob/three.js/master/examples/textures/planets/earth_normal_2048.jpg' },
  { name: 'mars_color.jpg', url: 'https://www.solarsystemscope.com/textures/download/2k_mars.jpg' },
  { name: 'jupiter_color.jpg', url: 'https://www.solarsystemscope.com/textures/download/2k_jupiter.jpg' },
  { name: 'saturn_color.jpg', url: 'https://www.solarsystemscope.com/textures/download/2k_saturn.jpg' },
  { name: 'saturn_ring.png', url: 'https://www.solarsystemscope.com/textures/download/2k_saturn_ring_alpha.png' },
  { name: 'mercury_color.jpg', url: 'https://www.solarsystemscope.com/textures/download/2k_mercury.jpg' },
  { name: 'venus_color.jpg', url: 'https://www.solarsystemscope.com/textures/download/2k_venus_surface.jpg' },
  { name: 'uranus_color.jpg', url: 'https://www.solarsystemscope.com/textures/download/2k_uranus.jpg' },
  { name: 'neptune_color.jpg', url: 'https://www.solarsystemscope.com/textures/download/2k_neptune.jpg' }
]

const destDir = path.join(__dirname, '..', 'public', 'textures')
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, (response) => {
      if (response.statusCode !== 200) {
        if (response.statusCode === 301 || response.statusCode === 302) {
          // Follow redirect
          return download(response.headers.location, dest).then(resolve).catch(reject)
        }
        reject(new Error(`Failed to get '${url}' (${response.statusCode})`))
        return
      }
      response.pipe(file)
      file.on('finish', () => {
        file.close(resolve)
      })
    }).on('error', (err) => {
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

async function main() {
  for (const t of textures) {
    console.log(`Downloading ${t.name}...`)
    try {
      await download(t.url, path.join(destDir, t.name))
      console.log(`✓ ${t.name}`)
    } catch (err) {
      console.error(`✗ Failed to download ${t.name}:`, err.message)
    }
  }
}

main()
