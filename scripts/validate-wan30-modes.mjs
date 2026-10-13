/**
 * Validate Wan 3.0 payloads against the fetched OpenAPI inputs.
 * No FAL submit. Wan 2.7 stays the pool model.
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
    if (!spec.enum.includes(payload[key])) errors.push(`${key}=${payload[key]} not in enum`)
  }
  if (payload.audio !== false) errors.push('audio must be false')
  if (payload.enable_prompt_expansion !== false) errors.push('prompt expansion must be false')
  if ('image_url' in payload || 'last_image_url' in payload || 'reference_media' in payload || 'num_frames' in payload || 'generate_audio' in payload) {
    errors.push('legacy field was sent')
  }
  if (typeof payload.prompt === 'string' && (payload.prompt.length > 20000 || payload.prompt.includes('#'))) {
    errors.push('prompt cap or hash tag')
  }
  if (typeof payload.duration !== 'number' || payload.duration < 2 || payload.duration > 30) {
    errors.push(`duration ${payload.duration}`)
  }
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const text = core.buildWan30Payload({
  mode: 'text',
  prompt: `${'A quiet street at dusk. '.repeat(2000)}`,
  durationSec: 1,
  resolution: '4k',
})
const first = core.buildWan30Payload({
  mode: 'first_frame',
  prompt: 'The street fills with rain.',
  imageUrl: 'https://example.com/start.jpg',
  durationSec: 8,
  resolution: '720p',
  aspectRatio: '16:9',
})
const last = core.buildWan30Payload({
  mode: 'first_last',
  prompt: 'The rain stops.',
  imageUrl: 'https://example.com/start.jpg',
  endImageUrl: 'https://example.com/end.jpg',
  durationSec: 40,
})
const images = Array.from({ length: 11 }, (_, i) => `https://example.com/ref-${i}.jpg`)
const videos = Array.from({ length: 6 }, (_, i) => `https://example.com/clip-${i}.mp4`)
const reference = core.buildWan30Payload({
  mode: 'reference',
  prompt: 'The subject in the new scene crosses the street.',
  imageUrls: images,
  videoUrls: videos,
  durationSec: 12,
})

check('text', text, inputSchema('/tmp/wan3-alibaba_wan-3.0_text-to-video.json'))
check('first_frame', first, inputSchema('/tmp/wan3-alibaba_wan-3.0_image-to-video.json'))
check('first_last', last, inputSchema('/tmp/wan3-alibaba_wan-3.0_image-to-video.json'))
check('reference', reference, inputSchema('/tmp/wan3-alibaba_wan-3.0_reference-to-video.json'))

if (text.duration !== 2 || text.resolution !== '1080p' || text.prompt.length > 20000) {
  console.log('FAIL text snap', text.duration, text.resolution, text.prompt.length)
  process.exitCode = 1
} else if (first.start_image_url == null || 'end_image_url' in first) {
  console.log('FAIL first frame field')
  process.exitCode = 1
} else if (last.end_image_url == null || last.duration !== 30 || 'reference_image_urls' in last) {
  console.log('FAIL last frame')
  process.exitCode = 1
} else if (reference.reference_image_urls.length !== 10 || reference.reference_video_urls.length !== 5 || 'start_image_url' in reference) {
  console.log('FAIL reference caps')
  process.exitCode = 1
} else if (core.WAN30_ENDPOINTS.text !== 'alibaba/wan-3.0/text-to-video' || core.WAN30_PRIME_TEXT === core.WAN30_ENDPOINTS.text) {
  console.log('FAIL endpoints', core.WAN30_ENDPOINTS)
  process.exitCode = 1
} else if (core.VIDEO_MODEL_REGISTRY['wan-2.7'].falEndpoint !== 'fal-ai/wan/v2.7/text-to-video') {
  console.log('FAIL pool model moved')
  process.exitCode = 1
} else {
  console.log('PASS duration clamp, start frame field, reference caps, 2.7 still the pool endpoint')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('wan 3.0 modes validated; generation not run')
