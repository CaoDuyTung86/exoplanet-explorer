const https = require('https')
const fs = require('fs')
const path = require('path')

const destDir = path.join(__dirname, '..', 'public', 'sounds')
if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true })

const sounds = [
  { name: 'click.mp3', url: 'https://www.soundjay.com/buttons/sounds/button-16.mp3' },
  { name: 'hover.mp3', url: 'https://www.soundjay.com/buttons/sounds/button-47.mp3' },
  { name: 'woosh.mp3', url: 'https://www.soundjay.com/nature/sounds/wind-howl-01.mp3' }
]

async function download(url, dest) {
  return new Promise((resolve, reject) => {
    const file = fs.createWriteStream(dest)
    https.get(url, (response) => {
      if (response.statusCode === 301 || response.statusCode === 302) {
        download(response.headers.location, dest).then(resolve).catch(reject)
        return
      }
      response.pipe(file)
      file.on('finish', () => {
        file.close()
        console.log(`Downloaded ${path.basename(dest)}`)
        resolve()
      })
    }).on('error', (err) => {
      fs.unlink(dest, () => {})
      reject(err)
    })
  })
}

async function run() {
  for (const s of sounds) {
    try {
      await download(s.url, path.join(destDir, s.name))
    } catch (e) {
      console.error(`Failed to download ${s.name}: ${e.message}`)
    }
  }
}

run()
