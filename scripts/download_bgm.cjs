const https = require('https')
const fs = require('fs')
const path = require('path')

const dest = path.join(__dirname, '..', 'public', 'sounds', 'bgm.mp3')

const url = 'https://www.soundjay.com/nature/sounds/wind-howl-03.mp3'

https.get(url, (response) => {
  if (response.statusCode === 200) {
    const file = fs.createWriteStream(dest)
    response.pipe(file)
    file.on('finish', () => {
      file.close()
      console.log('Downloaded bgm.mp3')
    })
  } else {
    console.error(`Failed to download bgm.mp3, status code: ${response.statusCode}`)
  }
}).on('error', (err) => {
  console.error(`Error downloading bgm: ${err.message}`)
})
