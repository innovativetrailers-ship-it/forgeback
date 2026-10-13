/**
 * Validate Kling 3.0 mode payloads against the fetched OpenAPI inputs.
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
  text: '/tmp/kl-fal-ai_kling-video_v3_pro_text-to-video.json',
  image: '/tmp/kl-fal-ai_kling-video_v3_pro_image-to-video.json',
  edit: '/tmp/kl-fal-ai_kling-video_o3_standard_video-to-video_edit.json',
}

function inputSchema(file) {
  const doc = JSON.parse(fs.readFileSync(file, 'utf8'))
  const schemas = doc.components.schemas
  const name = Object.keys(schemas).find((key) => key.endsWith('Input'))
  if (!name) throw new Error(`no Input schema in ${file}`)
  return { schema: schemas[name], schemas }
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
    if (!(key in payload) || !spec.enum) continue
    if (!spec.enum.includes(payload[key])) errors.push(`${key}=${payload[key]} not in enum`)
  }
  if ('generate_audio' in payload && payload.generate_audio !== false) errors.push('generate_audio must be false')
  if (typeof payload.duration === 'string' && (payload.duration === 'auto' || payload.duration.endsWith('s'))) {
    errors.push(`duration ${payload.duration} is not a 3..15 second string`)
  }
  if ('seed' in payload || 'resolution' in payload || 'image_url' in payload || 'cfg_scale' in payload) {
    errors.push('seed, resolution, image_url, or cfg_scale is not sent')
  }
  if (typeof payload.prompt === 'string' && payload.prompt.length > 2500) errors.push(`prompt length ${payload.prompt.length}`)
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const elements = core.klingElements([
  { frontal: 'https://example.com/maya-front.jpg', angles: ['https://example.com/maya-side.jpg', 'https://example.com/extra-1.jpg', 'https://example.com/extra-2.jpg', 'https://example.com/extra-3.jpg'] },
  { frontal: 'https://example.com/diner.jpg' },
])

const text = core.buildKlingPayload({
  mode: 'text',
  prompt: 'A craftsman turns a wooden bowl in warm light.',
  durationSec: 5,
  negativePrompt: 'blur',
})
const first = core.buildKlingPayload({
  mode: 'first_frame',
  prompt: 'The craftsman looks up.',
  durationSec: 3,
  imageUrl: 'https://example.com/start.jpg',
})
const last = core.buildKlingPayload({
  mode: 'first_last',
  prompt: 'The craftsman sets the bowl down.',
  durationSec: 8,
  imageUrl: 'https://example.com/start.jpg',
  endImageUrl: 'https://example.com/end.jpg',
})
const reference = core.buildKlingPayload({
  mode: 'reference',
  prompt: `${'Maya sits at the bench. '.repeat(200)}`,
  durationSec: 2,
  imageUrl: 'https://example.com/start.jpg',
  elements,
})
const edit = core.buildKlingPayload({
  mode: 'video_edit',
  prompt: 'Replace the bowl with a glass cup.',
  videoUrl: 'https://example.com/source.mp4',
})

const textDoc = inputSchema(FILES.text)
const imageDoc = inputSchema(FILES.image)
const editDoc = inputSchema(FILES.edit)
check('text', text, textDoc.schema)
check('first_frame', first, imageDoc.schema)
check('first_last', last, imageDoc.schema)
check('reference', reference, imageDoc.schema)
check('video_edit', edit, editDoc.schema)

const elementSchema = imageDoc.schemas.KlingV3ComboElementInput.properties
let elementOk = true
for (const element of reference.elements) {
  for (const key of Object.keys(element)) {
    if (!elementSchema[key]) elementOk = false
  }
  if (element.reference_image_urls && element.reference_image_urls.length > 3) elementOk = false
  if ('voice_id' in element) elementOk = false
}
if (!elementOk || !reference.prompt.includes('@Element1') || !reference.prompt.includes('@Element2')) {
  console.log('FAIL element shape or tags')
  process.exitCode = 1
} else if (reference.prompt.length > 2500) {
  console.log('FAIL cap', reference.prompt.length)
  process.exitCode = 1
} else if (reference.duration !== '3' || first.duration !== '3' || text.duration !== '5') {
  console.log('FAIL duration snap', text.duration, first.duration, reference.duration)
  process.exitCode = 1
} else if (first.start_image_url == null || 'image_url' in first) {
  console.log('FAIL start frame field')
  process.exitCode = 1
} else {
  console.log('PASS element tags, 3-image cap, 2500 prompt cap, duration snap')
}

if (core.KLING_ENDPOINTS.reference.includes('/elements')) {
  console.log('FAIL reference endpoint must not be the 404 id')
  process.exitCode = 1
} else {
  console.log('PASS reference endpoint is image-to-video')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('kling modes validated; generation not run')
