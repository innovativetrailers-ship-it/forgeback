/**
 * Validate Hailuo 02 payloads against the fetched OpenAPI inputs.
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
  if (payload.prompt_optimizer !== false) errors.push('prompt_optimizer must be false')
  if ('audio_url' in payload || 'generate_audio' in payload || 'resolution' in payload) {
    errors.push('audio or resolution was sent')
  }
  if (typeof payload.prompt === 'string' && payload.prompt.length > 2000) errors.push(`prompt ${payload.prompt.length}`)
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const text = core.buildHailuoPayload({
  kind: 'pro_text',
  prompt: `${'A quiet street at dusk. '.repeat(200)}`,
  durationSec: 10,
})
const first = core.buildHailuoPayload({
  kind: 'pro_image',
  prompt: 'The street fills with rain.',
  imageUrl: 'https://example.com/start.jpg',
  durationSec: 6,
})
const last = core.buildHailuoPayload({
  kind: 'pro_image',
  prompt: 'The rain stops.',
  imageUrl: 'https://example.com/start.jpg',
  endImageUrl: 'https://example.com/end.jpg',
})
const fast = core.buildHailuoPayload({
  kind: 'fast_image',
  prompt: 'A quick draft of the same street.',
  imageUrl: 'https://example.com/start.jpg',
  durationSec: 8,
  endImageUrl: 'https://example.com/end.jpg',
})
const standard = core.buildHailuoPayload({
  kind: 'standard_text',
  prompt: 'A standard take of the street.',
  durationSec: 6,
})

check('pro_text', text, inputSchema('/tmp/hl-fal-ai_minimax_hailuo-02_pro_text-to-video.json'))
check('pro_image', first, inputSchema('/tmp/hl-fal-ai_minimax_hailuo-02_pro_image-to-video.json'))
check('pro_last', last, inputSchema('/tmp/hl-fal-ai_minimax_hailuo-02_pro_image-to-video.json'))
check('fast_image', fast, inputSchema('/tmp/hl-fal-ai_minimax_hailuo-02-fast_image-to-video.json'))
check('standard_23_text', standard, inputSchema('/tmp/hl-fal-ai_minimax_hailuo-2.3_standard_text-to-video.json'))

if ('duration' in text || text.prompt.length > 2000) {
  console.log('FAIL pro text duration or cap')
  process.exitCode = 1
} else if ('duration' in first || 'end_image_url' in first) {
  console.log('FAIL pro image extras')
  process.exitCode = 1
} else if (last.end_image_url == null || 'duration' in last) {
  console.log('FAIL last frame')
  process.exitCode = 1
} else if (fast.duration !== '10' || 'end_image_url' in fast) {
  console.log('FAIL fast', fast.duration)
  process.exitCode = 1
} else if (core.HAILUO_ENDPOINTS.text !== 'fal-ai/minimax/hailuo-02/pro/text-to-video' || core.HAILUO_ENDPOINTS.reference) {
  console.log('FAIL endpoints', core.HAILUO_ENDPOINTS)
  process.exitCode = 1
} else {
  console.log('PASS pro has no duration, last frame field, fast duration string, 2000 cap')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('hailuo modes validated; generation not run')
