/**
 * Validate Seedance 2.0 mode payloads against the fetched OpenAPI inputs.
 * No FAL submit. Schemas are the files saved from the free OpenAPI GET.
 */
import fs from 'fs'
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'
const requireCore = createRequire(fileURLToPath(import.meta.url))
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const core = requireCore(path.join(__dirname, '../packages/core/dist/index.js'))

const FILES = {
  text: '/tmp/sd-bytedance_seedance-2.0_text-to-video.json',
  first_frame: '/tmp/sd-bytedance_seedance-2.0_image-to-video.json',
  first_last: '/tmp/sd-bytedance_seedance-2.0_image-to-video.json',
  reference: '/tmp/sd-bytedance_seedance-2.0_reference-to-video.json',
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
    if (!spec.enum.includes(payload[key])) errors.push(`${key}=${payload[key]} not in enum`)
  }
  if (payload.generate_audio !== false) errors.push('generate_audio must be false')
  if (typeof payload.duration === 'string' && payload.duration.endsWith('s')) errors.push('duration must not use an s suffix')
  if ('seed' in payload || 'prompt_optimizer' in payload || 'negative_prompt' in payload) {
    errors.push('seed, prompt_optimizer, or negative_prompt is not in the 2.0 schema')
  }
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const composition = core.selectReferences([
  { url: 'https://example.com/maya.jpg', label: 'Maya', bucket: 'image', role: 'character', primary: true },
  { url: 'https://example.com/alex.jpg', label: 'Alex', bucket: 'image', role: 'character' },
  { url: 'https://example.com/diner.jpg', label: 'the diner', bucket: 'image', role: 'location' },
  { url: 'https://example.com/line.mp3', label: "Maya's line", bucket: 'audio', role: 'dialogue' },
  { url: 'https://example.com/move.mp4', label: 'the motion reference', bucket: 'video', role: 'motion_ref' },
])

const text = core.buildSeedancePayload({
  mode: 'text',
  prompt: 'A quiet diner at night, rain on the window.',
  durationSec: 5,
})
const first = core.buildSeedancePayload({
  mode: 'first_frame',
  prompt: 'Maya looks up from the table.',
  durationSec: 8,
  imageUrl: 'https://example.com/frame.jpg',
})
const last = core.buildSeedancePayload({
  mode: 'first_last',
  prompt: 'Maya stands and leaves the booth.',
  durationSec: 6,
  imageUrl: 'https://example.com/start.jpg',
  endImageUrl: 'https://example.com/end.jpg',
})
const reference = core.buildSeedancePayload({
  mode: 'reference',
  prompt: 'Maya sits across from Alex in the diner.',
  durationSec: 5,
  composition,
  camera: { movement: 'slow dolly in' },
})

check('text', text, inputSchema(FILES.text))
check('first_frame', first, inputSchema(FILES.first_frame))
check('first_last', last, inputSchema(FILES.first_last))
check('reference', reference, inputSchema(FILES.reference))

if (!reference.prompt.includes('@Image1 is Maya')) {
  console.log('FAIL reference tag')
  process.exitCode = 1
} else if (!reference.prompt.includes('@Audio1') || !Array.isArray(reference.image_urls)) {
  console.log('FAIL reference files')
  process.exitCode = 1
} else if (reference.image_urls.length !== 3 || reference.video_urls.length !== 1 || reference.audio_urls.length !== 1) {
  console.log('FAIL reference counts', reference.image_urls.length, reference.video_urls?.length, reference.audio_urls?.length)
  process.exitCode = 1
} else {
  console.log('PASS reference composition')
}

const overflow = []
for (let i = 0; i < 11; i += 1) {
  overflow.push({ url: `https://example.com/c${i}.jpg`, label: `C${i}`, bucket: 'image', role: 'character', primary: i === 0 })
}
for (let i = 0; i < 4; i += 1) {
  overflow.push({ url: `https://example.com/v${i}.mp4`, bucket: 'video', role: 'motion_ref' })
}
for (let i = 0; i < 4; i += 1) {
  overflow.push({ url: `https://example.com/a${i}.mp3`, bucket: 'audio', role: 'dialogue' })
}
const capped = core.selectReferences(overflow)
const total = capped.images.length + capped.videos.length + capped.audios.length
if (capped.images.length > 9 || capped.videos.length > 3 || capped.audios.length > 3 || total > 12) {
  console.log('FAIL caps', capped.images.length, capped.videos.length, capped.audios.length)
  process.exitCode = 1
} else {
  console.log('PASS caps', { images: capped.images.length, videos: capped.videos.length, audios: capped.audios.length, total })
}

if (core.prefersSeedanceReference({ continueExactFrame: true, charactersPresent: ['Maya', 'Alex'] })) {
  console.log('FAIL chain should stay off reference routing')
  process.exitCode = 1
} else if (!core.prefersSeedanceReference({ charactersPresent: ['Maya'], locationsPresent: ['diner'] })) {
  console.log('FAIL character plus location should prefer seedance')
  process.exitCode = 1
} else {
  console.log('PASS routing preference')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('seedance modes validated; generation not run')
