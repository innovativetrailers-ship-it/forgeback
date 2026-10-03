/**
 * Validate HappyHorse 1.0 payloads against the fetched OpenAPI inputs.
 * No FAL submit. Not added to the routing pool.
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const requireCore = createRequire(fileURLToPath(import.meta.url))
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const core = requireCore(path.join(__dirname, '../packages/core/dist/index.js'))

function inputSchema(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  const schemas = doc.components.schemas
  const name = Object.keys(schemas).find((key) => key.endsWith('Input'))
  if (!name) throw new Error(`no Input schema in ${file}`)
  return schemas[name]
}

function check(label, payload, schema) {
  const errors = []
  for (const key of Object.keys(payload)) {
    if (!schema.properties[key]) errors.push(`unknown field ${key}`)
  }
  for (const required of schema.required ?? []) {
    if (payload[required] == null || payload[required] === '') errors.push(`missing ${required}`)
  }
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (!(key in payload) || !spec.enum) continue
    if (!spec.enum.includes(payload[key])) errors.push(`${key}=${JSON.stringify(payload[key])} not in enum`)
  }
  if ('generate_audio' in payload || 'enable_safety_checker' in payload) errors.push('audio or safety field was sent')
  if (typeof payload.prompt === 'string' && payload.prompt.length > 2500) errors.push(`prompt ${payload.prompt.length}`)
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const text = core.buildHappyHorsePayload({
  kind: 'text',
  prompt: `${'A quiet street at dusk. '.repeat(200)}`,
  durationSec: 2,
  resolution: '4k',
  imageUrl: 'https://example.com/should-not-send.jpg',
})
const first = core.buildHappyHorsePayload({
  kind: 'first_frame',
  prompt: 'The street fills with rain.',
  imageUrl: 'https://example.com/start.jpg',
  durationSec: 16,
  aspectRatio: '9:16',
})
const urls = Array.from({ length: 10 }, (_, i) => `https://example.com/ref-${i}.jpg`)
const reference = core.buildHappyHorsePayload({
  kind: 'reference',
  prompt: 'The subject crosses the street.',
  imageUrls: urls,
  names: ['Maya'],
  durationSec: 1,
})
const edit = core.buildHappyHorsePayload({
  kind: 'video_edit',
  prompt: 'Change the coat to red.',
  videoUrl: 'https://example.com/source.mp4',
  imageUrls: urls,
  durationSec: 2,
})

check('text', text, inputSchema('/tmp/hh-alibaba_happy-horse_text-to-video.json'))
check('first_frame', first, inputSchema('/tmp/hh-alibaba_happy-horse_image-to-video.json'))
check('reference', reference, inputSchema('/tmp/hh-alibaba_happy-horse_reference-to-video.json'))
check('video_edit', edit, inputSchema('/tmp/hh-alibaba_happy-horse_video-edit.json'))

if ('image_url' in text || text.duration !== 3 || text.resolution !== '1080p') {
  console.log('FAIL text', text.duration, text.resolution)
  process.exitCode = 1
} else if (first.image_url == null || 'aspect_ratio' in first || first.duration !== 15) {
  console.log('FAIL first frame')
  process.exitCode = 1
} else if (reference.image_urls.length !== 9 || !reference.prompt.includes('character1 is Maya') || 'image_url' in reference || reference.duration !== 3) {
  console.log('FAIL reference', reference.duration, reference.image_urls?.length)
  process.exitCode = 1
} else if ('duration' in edit || edit.audio_setting !== 'origin' || edit.reference_image_urls.length !== 5 || !edit.prompt.includes('@Image1')) {
  console.log('FAIL edit')
  process.exitCode = 1
} else if (core.HAPPYHORSE_ENDPOINTS.text !== 'alibaba/happy-horse/text-to-video' || core.HAPPYHORSE_11_TEXT === core.HAPPYHORSE_ENDPOINTS.text) {
  console.log('FAIL endpoints', core.HAPPYHORSE_ENDPOINTS)
  process.exitCode = 1
} else {
  console.log('PASS no image on text, duration enum, reference cap, edit has no duration')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('happyhorse modes validated; generation not run; not added to the routing pool')
