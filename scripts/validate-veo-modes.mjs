/**
 * Validate Veo 3.1 mode payloads against the fetched OpenAPI inputs.
 * No FAL submit.
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const requireCore = createRequire(fileURLToPath(import.meta.url))
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const core = requireCore(path.join(__dirname, '../packages/core/dist/index.js'))

const FILES = {
  text: '/tmp/veo-fal-ai_veo3.1.json',
  image: '/tmp/veo-fal-ai_veo3.1_image-to-video.json',
  reference: '/tmp/veo-fal-ai_veo3.1_reference-to-video.json',
  firstLast: '/tmp/veo-fal-ai_veo3.1_first-last-frame-to-video.json',
  extend: '/tmp/veo-fal-ai_veo3.1_extend-video.json',
}

function inputSchema(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  const schemas = doc.components.schemas
  const name = Object.keys(schemas).find((key) => key.endsWith('Input'))
  if (!name) throw new Error(`no Input schema in ${file}`)
  return schemas[name]
}

function check(label, payload, schema) {
  const errors = []
  const props = schema.properties
  for (const key of Object.keys(payload)) {
    if (!props[key]) errors.push(`unknown field ${key}`)
  }
  for (const required of schema.required ?? []) {
    if (payload[required] == null || payload[required] === '') errors.push(`missing ${required}`)
  }
  for (const [key, spec] of Object.entries(props)) {
    if (!(key in payload)) continue
    if (spec.enum && !spec.enum.includes(payload[key])) errors.push(`${key}=${payload[key]} not in enum`)
    if (spec.const && payload[key] !== spec.const) errors.push(`${key}=${payload[key]} const ${spec.const}`)
  }
  if (payload.generate_audio !== false) errors.push('generate_audio must be false')
  if ('auto_fix' in payload || 'safety_tolerance' in payload) errors.push('auto_fix and safety_tolerance are not sent')
  if (typeof payload.duration === 'number' || (typeof payload.duration === 'string' && !payload.duration.endsWith('s'))) {
    errors.push(`duration ${payload.duration} must be an Ns string`)
  }
  if (typeof payload.prompt === 'string' && payload.prompt.length > 20000) errors.push(`prompt length ${payload.prompt.length}`)
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const text = core.buildVeoPayload({
  mode: 'text',
  prompt: 'Rain on a diner window at night.',
  durationSec: 5,
  aspectRatio: 'auto',
})
const first = core.buildVeoPayload({
  mode: 'first_frame',
  prompt: 'The window glass fogs.',
  durationSec: 4,
  imageUrl: 'https://example.com/start.jpg',
  resolution: '1080p',
})
const last = core.buildVeoPayload({
  mode: 'first_last',
  prompt: 'Dawn replaces the rain.',
  durationSec: 8,
  imageUrl: 'https://example.com/start.jpg',
  endImageUrl: 'https://example.com/end.jpg',
})
const reference = core.buildVeoPayload({
  mode: 'reference',
  prompt: 'Maya sits in the same booth.',
  durationSec: 4,
  imageUrls: [
    'https://example.com/a.jpg',
    'https://example.com/b.jpg',
    'https://example.com/c.jpg',
    'https://example.com/d.jpg',
  ],
  seed: 7,
})
const extend = core.buildVeoPayload({
  mode: 'video_edit',
  prompt: 'Continue as she stands and leaves.',
  videoUrl: 'https://example.com/source.mp4',
  resolution: '4k',
  durationSec: 8,
})
const capped = core.buildVeoPayload({
  mode: 'text',
  prompt: `${'A long faithful scene. '.repeat(2000)}`,
  durationSec: 8,
})

check('text', text, inputSchema(FILES.text))
check('first_frame', first, inputSchema(FILES.image))
check('first_last', last, inputSchema(FILES.firstLast))
check('reference', reference, inputSchema(FILES.reference))
check('extend', extend, inputSchema(FILES.extend))

if (text.duration !== '6s' || text.aspect_ratio !== '16:9') {
  console.log('FAIL text snap', text.duration, text.aspect_ratio)
  process.exitCode = 1
} else if (last.first_frame_url == null || last.last_frame_url == null || 'image_url' in last || 'end_image_url' in last) {
  console.log('FAIL first/last field names')
  process.exitCode = 1
} else if (reference.duration !== '8s' || reference.image_urls.length !== 3 || 'seed' in reference) {
  console.log('FAIL reference lock', reference.duration, reference.image_urls?.length)
  process.exitCode = 1
} else if (extend.duration !== '7s' || extend.resolution !== '720p') {
  console.log('FAIL extend const', extend.duration, extend.resolution)
  process.exitCode = 1
} else if (capped.prompt.length > 20000) {
  console.log('FAIL prompt cap', capped.prompt.length)
  process.exitCode = 1
} else if (core.VEO_ENDPOINTS.text !== 'fal-ai/veo3.1' || String(core.VEO_ENDPOINTS.text).includes('text-to-video')) {
  console.log('FAIL text endpoint', core.VEO_ENDPOINTS.text)
  process.exitCode = 1
} else {
  console.log('PASS duration Ns, first/last fields, reference 8s cap 3, extend consts, 20000 cap')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('veo modes validated; generation not run')
