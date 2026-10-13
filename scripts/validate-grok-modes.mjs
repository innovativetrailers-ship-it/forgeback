/**
 * Validate Grok Imagine v1.5 payloads against the fetched OpenAPI inputs.
 * No FAL submit.
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
  if ('generate_audio' in payload || 'audio' in payload || 'seed' in payload || 'end_image_url' in payload) {
    errors.push('audio, seed, or last frame was sent')
  }
  if (typeof payload.prompt === 'string' && (payload.prompt.length > 4096 || payload.prompt.includes('@Image'))) {
    errors.push('prompt cap or @Image tag')
  }
  if (typeof payload.duration !== 'number' || payload.duration < 1 || payload.duration > 15) {
    errors.push(`duration ${payload.duration}`)
  }
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const text = core.buildGrokPayload({
  mode: 'text',
  prompt: `${'A quiet street at dusk. '.repeat(400)}`,
  durationSec: 20,
  resolution: '4k',
})
const first = core.buildGrokPayload({
  mode: 'first_frame',
  prompt: 'The street fills with rain.',
  imageUrl: 'https://example.com/start.jpg',
  durationSec: 0,
  aspectRatio: '9:16',
  endImageUrl: 'https://example.com/end.jpg',
})
const urls = Array.from({ length: 8 }, (_, i) => `https://example.com/ref-${i}.jpg`)
const reference = core.buildGrokPayload({
  mode: 'reference',
  prompt: 'The subject crosses the street.',
  imageUrls: urls,
  names: ['Maya', 'the diner'],
  resolution: '1080p',
})

check('text', text, inputSchema('/tmp/grok-xai_grok-imagine-video_v1.5_text-to-video.json'))
check('first_frame', first, inputSchema('/tmp/grok-xai_grok-imagine-video_v1.5_image-to-video.json'))
check('reference', reference, inputSchema('/tmp/grok-xai_grok-imagine-video_v1.5_reference-to-video.json'))

if (text.duration !== 15 || text.resolution !== '720p' || text.prompt.length > 4096 || 'image_url' in text) {
  console.log('FAIL text snap')
  process.exitCode = 1
} else if (first.image_url == null || first.duration !== 6 || 'aspect_ratio' in first) {
  console.log('FAIL first frame')
  process.exitCode = 1
} else if (
  reference.reference_image_urls.length !== 7
  || reference.resolution !== '720p'
  || reference.duration !== 8
  || !reference.prompt.includes('<IMAGE_0> is Maya')
  || reference.prompt.includes('@Image')
) {
  console.log('FAIL reference', reference.resolution, reference.duration, reference.prompt.slice(0, 80))
  process.exitCode = 1
} else if (core.GROK_ENDPOINTS.text !== 'xai/grok-imagine-video/v1.5/text-to-video' || core.GROK_BASE_TEXT === core.GROK_ENDPOINTS.text) {
  console.log('FAIL endpoints', core.GROK_ENDPOINTS)
  process.exitCode = 1
} else if (core.VIDEO_MODEL_REGISTRY['grok-imagine-video'].falEndpoint !== core.GROK_ENDPOINTS.text) {
  console.log('FAIL registry')
  process.exitCode = 1
} else {
  console.log('PASS duration clamp, no last frame, reference tags, v1.5 registry')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('grok modes validated; generation not run')
