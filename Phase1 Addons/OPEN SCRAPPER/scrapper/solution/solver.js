import { readFileSync } from 'fs'
import { resolve } from 'path'

const imagePath = resolve(process.argv[2] ?? './captcha.png')
const host = process.env.OLLAMA_HOST ?? 'http://localhost:11434'

console.log(`Reading image: ${imagePath}`)
console.log(`Ollama host:   ${host}`)
console.log(`Model:         gemma4:31b-cloud`)
console.log('Solving captcha...\n')

const imageBase64 = readFileSync(imagePath).toString('base64')

const res = await fetch(`${host}/api/generate`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    model: 'gemma4:31b-cloud',
    prompt:
      'This is a CAPTCHA image. Read the characters exactly as they appear, ignoring any noise, dots, or background distortions. Reply with only the captcha characters, nothing else.',
    images: [imageBase64],
    stream: false
  })
})

if (!res.ok) {
  const err = await res.text()
  console.error(`Ollama error (${res.status}): ${err}`)
  process.exit(1)
}

const data = await res.json()
const answer = data.response?.trim()

if (!answer) {
  console.error('Model returned an empty response.')
  process.exit(1)
}

console.log('Solved CAPTCHA:', answer)
