/**
 * Validate LTX 2.3 payloads against the fetched OpenAPI inputs.
 * No FAL submit. Draft id stays ltx-2.3-fast.
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
  if (payload.generate_audio !== false) errors.push('generate_audio must be false')
  if ('seed' in payload || 'audio_url' in payload) errors.push('seed or audio_url was sent')
  if (typeof payload.prompt === 'string' && payload.prompt.length > 5000) errors.push(`prompt ${payload.prompt.length}`)
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const text = core.buildLtxPayload({
  kind: 'fast_text',
  prompt: `${'A quiet street at dusk. '.repeat(400)}`,
  durationSec: 11,
  resolution: '2160p',
  imageUrl: 'https://example.com/should-not-send.jpg',
})
const short = core.buildLtxPayload({
  kind: 'fast_text',
  prompt: 'A quiet street at dusk.',
  durationSec: 7,
  resolution: '1440p',
})
const first = core.buildLtxPayload({
  kind: 'image',
  prompt: 'The street fills with rain.',
  imageUrl: 'https://example.com/start.jpg',
  durationSec: 12,
  resolution: '720p',
  aspectRatio: '1:1',
})
const last = core.buildLtxPayload({
  kind: 'image',
  prompt: 'The rain stops.',
  imageUrl: 'https://example.com/start.jpg',
  endImageUrl: 'https://example.com/end.jpg',
  durationSec: 5,
})

check('fast_text_long', text, inputSchema('/tmp/ltx-fal-ai_ltx-2.3_text-to-video_fast.json'))
check('fast_text_short', short, inputSchema('/tmp/ltx-fal-ai_ltx-2.3_text-to-video_fast.json'))
check('first_frame', first, inputSchema('/tmp/ltx-fal-ai_ltx-2.3_image-to-video.json'))
check('first_last', last, inputSchema('/tmp/ltx-fal-ai_ltx-2.3_image-to-video.json'))

const entry = core.VIDEO_MODEL_REGISTRY['ltx-2.3-fast']
if ('image_url' in text || text.duration !== 12 || text.resolution !== '1080p' || text.fps !== 25 || text.prompt.length > 5000) {
  console.log('FAIL long text', text.duration, text.resolution, text.fps, text.prompt.length)
  process.exitCode = 1
} else if (short.duration !== 8 || short.resolution !== '1440p' || 'fps' in short) {
  console.log('FAIL short text', short.duration, short.resolution)
  process.exitCode = 1
} else if (first.image_url == null || first.duration !== 10 || first.resolution !== '1080p' || first.aspect_ratio !== 'auto' || 'end_image_url' in first) {
  console.log('FAIL first frame', first.duration, first.resolution, first.aspect_ratio)
  process.exitCode = 1
} else if (last.end_image_url == null || last.duration !== 6) {
  console.log('FAIL last frame', last.duration)
  process.exitCode = 1
} else if (entry.falEndpoint !== 'fal-ai/ltx-2.3/text-to-video/fast' || entry.i2vEndpoint !== 'fal-ai/ltx-2.3/image-to-video') {
  console.log('FAIL registry', entry.falEndpoint, entry.i2vEndpoint)
  process.exitCode = 1
} else if (core.LTX_ENDPOINTS.text !== entry.falEndpoint || core.LTX_AUDIO === core.LTX_ENDPOINTS.text) {
  console.log('FAIL endpoints', core.LTX_ENDPOINTS)
  process.exitCode = 1
} else {
  console.log('PASS fast duration, silent audio, image cap, draft endpoints')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('ltx modes validated; generation not run')
