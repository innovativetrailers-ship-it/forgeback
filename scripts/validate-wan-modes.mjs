/**
 * Validate Wan 2.7 mode payloads against the fetched OpenAPI inputs.
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
  text: '/tmp/wan-fal-ai_wan_v2.7_text-to-video.json',
  image: '/tmp/wan-fal-ai_wan_v2.7_image-to-video.json',
  reference: '/tmp/wan-fal-ai_wan_v2.7_reference-to-video.json',
  edit: '/tmp/wan-fal-ai_wan_v2.7_edit.json',
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
    if (!(key in payload) || !spec.enum) continue
    if (!spec.enum.includes(payload[key])) errors.push(`${key}=${JSON.stringify(payload[key])} not in enum`)
  }
  if ('generate_audio' in payload || 'num_frames' in payload || 'audio_url' in payload) {
    errors.push('generate_audio, num_frames, or audio_url was sent')
  }
  if (payload.enable_prompt_expansion === true) errors.push('prompt expansion must not rewrite the scene')
  if (typeof payload.duration === 'string') errors.push('duration must be an integer')
  if (typeof payload.prompt === 'string' && (payload.prompt.length > 5000 || payload.prompt.includes('#'))) {
    errors.push(`prompt length ${payload.prompt.length} or hash tag`)
  }
  if (typeof payload.negative_prompt === 'string' && payload.negative_prompt.length > 500) {
    errors.push('negative prompt over 500')
  }
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const text = core.buildWanPayload({
  mode: 'text',
  prompt: `${'A kitten in a meadow. '.repeat(400)}`,
  durationSec: 1,
  aspectRatio: 'auto',
  negativePrompt: `${'blur '.repeat(200)}`,
})
const first = core.buildWanPayload({
  mode: 'first_frame',
  prompt: 'The kitten turns toward camera.',
  durationSec: 5,
  imageUrl: 'https://example.com/start.jpg',
  resolution: '1080p',
})
const last = core.buildWanPayload({
  mode: 'first_last',
  prompt: 'The kitten sits.',
  durationSec: 8,
  imageUrl: 'https://example.com/start.jpg',
  endImageUrl: 'https://example.com/end.jpg',
})
const reference = core.buildWanPayload({
  mode: 'reference',
  prompt: 'The same kitten walks through the garden.',
  durationSec: 12,
  imageUrls: ['https://example.com/a.jpg', 'https://example.com/b.jpg', 'https://example.com/c.jpg', 'https://example.com/d.jpg', 'https://example.com/e.jpg'],
  videoUrls: ['https://example.com/move.mp4'],
})

check('text', text, inputSchema(FILES.text))
check('first_frame', first, inputSchema(FILES.image))
check('first_last', last, inputSchema(FILES.image))
check('reference', reference, inputSchema(FILES.reference))

const edit = inputSchema(FILES.edit)
if (edit.properties.video_url || !edit.properties.image_urls) {
  console.log('FAIL edit schema was expected to be an image edit')
  process.exitCode = 1
} else if (text.duration !== 2 || text.enable_prompt_expansion !== false || text.prompt.length > 5000) {
  console.log('FAIL text', text.duration, text.enable_prompt_expansion, text.prompt.length)
  process.exitCode = 1
} else if ('aspect_ratio' in first || first.resolution !== '1080p' || first.enable_prompt_expansion !== false) {
  console.log('FAIL first frame')
  process.exitCode = 1
} else if (last.end_image_url == null || 'aspect_ratio' in last) {
  console.log('FAIL first last')
  process.exitCode = 1
} else if (reference.duration !== 10 || reference.reference_image_urls.length !== 4 || 'enable_prompt_expansion' in reference) {
  console.log('FAIL reference', reference.duration, reference.reference_image_urls?.length)
  process.exitCode = 1
} else if (String(core.WAN_ENDPOINTS.text).includes('wan-2.6') || core.WAN_ENDPOINTS.video_edit) {
  console.log('FAIL endpoints', core.WAN_ENDPOINTS)
  process.exitCode = 1
} else {
  console.log('PASS integer duration, 5000 cap, no hash tags, reference cap 4, edit left unwired')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('wan modes validated; generation not run')
