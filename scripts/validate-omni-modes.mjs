/**
 * Validate Gemini Omni Flash 1.1 payloads against live OpenAPI inputs.
 * Fetches schema. No FAL submit.
 */
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
import path from 'path'

const requireCore = createRequire(fileURLToPath(import.meta.url))
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const core = requireCore(path.join(__dirname, '../packages/core/dist/index.js'))

const OPENAPI = 'https://fal.ai/api/openapi/queue/openapi.json?endpoint_id='

async function inputSchema(endpoint) {
  const res = await fetch(`${OPENAPI}${encodeURIComponent(endpoint)}`)
  if (res.status !== 200) throw new Error(`${endpoint} OpenAPI ${res.status}`)
  const doc = await res.json()
  const schemas = doc.components.schemas
  const name = Object.keys(schemas).find((key) => key.endsWith('Input'))
  if (!name) throw new Error(`no Input schema in ${endpoint}`)
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
    if (spec.minimum != null && typeof payload[key] === 'number' && payload[key] < spec.minimum) {
      errors.push(`${key}=${payload[key]} below min ${spec.minimum}`)
    }
    if (spec.maximum != null && typeof payload[key] === 'number' && payload[key] > spec.maximum) {
      errors.push(`${key}=${payload[key]} above max ${spec.maximum}`)
    }
    if (spec.maxItems != null && Array.isArray(payload[key]) && payload[key].length > spec.maxItems) {
      errors.push(`${key} length ${payload[key].length} > ${spec.maxItems}`)
    }
  }
  if ('generate_audio' in payload || 'audio' in payload || 'seed' in payload) {
    errors.push('audio toggle or seed was sent')
  }
  if ('start_image_url' in payload || 'first_frame_url' in payload) {
    errors.push('wrong first-frame field name')
  }
  if (typeof payload.prompt === 'string' && payload.prompt.length > 20000) {
    errors.push(`prompt length ${payload.prompt.length}`)
  }
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const text = core.buildOmniPayload({
  mode: 'text',
  prompt: `${'A quiet street at dusk. '.repeat(1200)}`,
  durationSec: 20,
  resolution: '4k',
  aspectRatio: '1:1',
})
const first = core.buildOmniPayload({
  mode: 'first_frame',
  prompt: 'The street fills with rain.',
  imageUrl: 'https://example.com/start.jpg',
  durationSec: 0,
  aspectRatio: '9:16',
})
const last = core.buildOmniPayload({
  mode: 'first_last',
  prompt: 'Dawn replaces the rain.',
  imageUrl: 'https://example.com/start.jpg',
  endImageUrl: 'https://example.com/end.jpg',
  durationSec: 10,
  resolution: '1080p',
})
const urls = Array.from({ length: 12 }, (_, i) => `https://example.com/ref-${i}.jpg`)
const reference = core.buildOmniPayload({
  mode: 'reference',
  prompt: 'The subject crosses the street.',
  imageUrls: urls,
  names: ['Maya', 'the diner'],
  videoUrls: ['https://example.com/clip.mp4', 'https://example.com/clip-2.mp4', 'https://example.com/clip-3.mp4', 'https://example.com/clip-4.mp4'],
  resolution: '720p',
})
const edit = core.buildOmniPayload({
  mode: 'video_edit',
  prompt: 'Continue as she stands and leaves.',
  videoUrl: 'https://example.com/source.mp4',
  durationSec: 8,
  aspectRatio: '16:9',
  resolution: '4k',
})

const [textSchema, imageSchema, refSchema, editSchema] = await Promise.all([
  inputSchema(core.OMNI_TEXT),
  inputSchema(core.OMNI_IMAGE),
  inputSchema(core.OMNI_REFERENCE),
  inputSchema(core.OMNI_EDIT),
])

check('text', text, textSchema)
check('first_frame', first, imageSchema)
check('first_last', last, imageSchema)
check('reference', reference, refSchema)
check('edit', edit, editSchema)

if (text.duration !== 10 || text.resolution !== '4k' || text.aspect_ratio !== '16:9' || text.prompt.length > 20000 || 'image_url' in text) {
  console.log('FAIL text snap', text.duration, text.resolution, text.aspect_ratio, text.prompt.length)
  process.exitCode = 1
} else if (first.image_url == null || first.duration !== 8 || 'end_image_url' in first || 'start_image_url' in first) {
  console.log('FAIL first frame', first)
  process.exitCode = 1
} else if (last.image_url == null || last.end_image_url == null || last.duration !== 10) {
  console.log('FAIL first last', last)
  process.exitCode = 1
} else if (
  reference.image_urls.length !== 10
  || reference.reference_video_urls.length !== 3
  || !reference.prompt.includes('<IMAGE_REF_0> is Maya')
  || !reference.prompt.includes('<VIDEO_REF_0>')
  || reference.prompt.includes('@Image')
) {
  console.log('FAIL reference', reference.image_urls?.length, reference.prompt.slice(0, 120))
  process.exitCode = 1
} else if (
  edit.video_url == null
  || 'duration' in edit
  || 'aspect_ratio' in edit
  || edit.resolution !== '4k'
) {
  console.log('FAIL edit', edit)
  process.exitCode = 1
} else if (core.OMNI_ENDPOINTS.text !== 'google/gemini-omni-flash/v1.1/text-to-video' || core.OMNI_BASE_TEXT === core.OMNI_ENDPOINTS.text) {
  console.log('FAIL endpoints', core.OMNI_ENDPOINTS)
  process.exitCode = 1
} else if (core.VIDEO_MODEL_REGISTRY['gemini-omni'].falEndpoint !== core.OMNI_ENDPOINTS.text) {
  console.log('FAIL registry')
  process.exitCode = 1
} else if (core.VIDEO_MODEL_REGISTRY['gemini-omni'].i2vEndpoint !== core.OMNI_IMAGE) {
  console.log('FAIL i2v registry')
  process.exitCode = 1
} else {
  console.log('PASS duration clamp, image_url not start_image_url, ref tags, v1.1 registry')
}

const live = new Set([
  core.VIDEO_MODEL_REGISTRY['gemini-omni'].falEndpoint,
  core.VIDEO_MODEL_REGISTRY['gemini-omni'].i2vEndpoint,
  core.VIDEO_MODEL_REGISTRY['gemini-omni'].referenceEndpoint,
  core.OMNI_EDIT,
])
for (const id of core.OMNI_UNVERIFIED_IDS) {
  if (live.has(id)) {
    console.log('FAIL unverified id in live registry', id)
    process.exitCode = 1
  }
}
if (!process.exitCode) console.log('PASS unverified Omni Audio/Character/unified ids are not registered')

if ('generate_audio' in textSchema.properties || 'generate_audio' in imageSchema.properties) {
  console.log('FAIL schema grew a generate_audio field; overlay silence path needs a revisit')
  process.exitCode = 1
} else {
  console.log('PASS no generate_audio on Omni schemas')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('omni modes validated; generation not run')
