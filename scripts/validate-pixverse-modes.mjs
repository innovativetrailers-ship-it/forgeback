/**
 * Validate PixVerse v5.6 payloads against the fetched OpenAPI inputs.
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
  if (payload.generate_audio_switch !== false) errors.push('audio switch must be false')
  if (payload.thinking_type !== 'disabled') errors.push('thinking_type must be disabled')
  if ('generate_audio' in payload || 'motion_mode' in payload || 'reference_image_urls' in payload) {
    errors.push('legacy field was sent')
  }
  if (typeof payload.duration !== 'string') errors.push(`duration type ${typeof payload.duration}`)
  if (typeof payload.prompt === 'string' && Buffer.byteLength(payload.prompt, 'utf8') > 2048) {
    errors.push(`prompt bytes ${Buffer.byteLength(payload.prompt, 'utf8')}`)
  }
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const text = core.buildPixversePayload({
  kind: 'v56_text',
  prompt: `${'A quiet street at dusk. '.repeat(200)}`,
  durationSec: 9,
  resolution: '720p',
})
const hd = core.buildPixversePayload({
  kind: 'v56_text',
  prompt: 'A quiet street at dusk.',
  durationSec: 10,
  resolution: '1080p',
})
const first = core.buildPixversePayload({
  kind: 'v56_image',
  prompt: 'The street fills with rain.',
  imageUrl: 'https://example.com/start.jpg',
  durationSec: 6,
  aspectRatio: '9:16',
})
const last = core.buildPixversePayload({
  kind: 'v56_transition',
  prompt: 'The rain stops.',
  imageUrl: 'https://example.com/start.jpg',
  endImageUrl: 'https://example.com/end.jpg',
  durationSec: 10,
  resolution: '1080p',
})

check('text', text, inputSchema('/tmp/px-fal-ai_pixverse_v5.6_text-to-video.json'))
check('hd', hd, inputSchema('/tmp/px-fal-ai_pixverse_v5.6_text-to-video.json'))
check('first_frame', first, inputSchema('/tmp/px-fal-ai_pixverse_v5.6_image-to-video.json'))
check('transition', last, inputSchema('/tmp/px-fal-ai_pixverse_v5.6_transition.json'))

if (text.duration !== '10' || hd.duration !== '8' || 'image_url' in text) {
  console.log('FAIL duration', text.duration, hd.duration)
  process.exitCode = 1
} else if (first.image_url == null || 'aspect_ratio' in first || first.duration !== '5') {
  console.log('FAIL first frame', first.duration)
  process.exitCode = 1
} else if (last.first_image_url == null || last.end_image_url == null || 'image_url' in last || last.duration !== '8') {
  console.log('FAIL transition')
  process.exitCode = 1
} else if (core.PIXVERSE_ENDPOINTS.text !== 'fal-ai/pixverse/v5.6/text-to-video' || core.PIXVERSE_ENDPOINTS.first_last !== 'fal-ai/pixverse/v5.6/transition') {
  console.log('FAIL endpoints', core.PIXVERSE_ENDPOINTS)
  process.exitCode = 1
} else if (core.VIDEO_MODEL_REGISTRY['pixverse-c1'] || core.VIDEO_MODEL_REGISTRY['pixverse-v6']) {
  console.log('FAIL dishonest ids entered the registry')
  process.exitCode = 1
} else {
  console.log('PASS string duration, 1080p cap, transition fields, no pool alias')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('pixverse modes validated; generation not run')
