/**
 * Validate image payloads against the fetched OpenAPI inputs.
 * No FAL submit. These models stay out of the video registry.
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

function check(label, input, schema) {
  const errors = []
  for (const key of Object.keys(input)) {
    if (!schema.properties[key]) errors.push(`unknown field ${key}`)
  }
  for (const required of schema.required ?? []) {
    if (input[required] == null || input[required] === '') errors.push(`missing ${required}`)
  }
  for (const [key, spec] of Object.entries(schema.properties)) {
    if (!(key in input) || !spec.enum) continue
    if (!spec.enum.includes(input[key])) errors.push(`${key}=${input[key]} not in enum`)
  }
  if ('image_url' in input || 'enhance_prompt' in input || 'ip_adapters' in input) {
    errors.push('video-style or rewrite field was sent')
  }
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const keyframe = core.buildImagePayload({
  model: core.imageModelForUse('keyframe', false),
  prompt: 'Opening frame of a quiet street.',
  aspectRatio: '16:9',
})
const character = core.buildImagePayload({
  model: core.imageModelForUse('character', true),
  prompt: 'Maya, the same face, front and three-quarter.',
  aspectRatio: '3:4',
  resolution: '4k',
  imageUrls: Array.from({ length: 15 }, (_, i) => `https://example.com/ref-${i}.jpg`),
})
const location = core.buildImagePayload({
  model: core.imageModelForUse('location', false),
  prompt: 'A diner at night, wide plate.',
  aspectRatio: '16:9',
})
const flux = core.buildImagePayload({
  model: 'flux-dev',
  prompt: 'Opening frame of a quiet street.',
  aspectRatio: '16:9',
})

check('keyframe', keyframe.input, inputSchema('/tmp/img-fal-ai_nano-banana.json'))
check('character', character.input, inputSchema('/tmp/img-fal-ai_nano-banana-2_edit.json'))
check('location', location.input, inputSchema('/tmp/img-fal-ai_nano-banana-2.json'))
check('flux', flux.input, inputSchema('/tmp/img-fal-ai_flux_dev.json'))

let threw = false
try {
  core.buildImagePayload({ model: 'nano-banana', prompt: 'no' })
} catch {
  threw = true
}

if (keyframe.endpoint !== 'fal-ai/nano-banana' || 'resolution' in keyframe.input) {
  console.log('FAIL keyframe endpoint')
  process.exitCode = 1
} else if (character.endpoint !== 'fal-ai/nano-banana-2/edit' || character.input.image_urls.length !== 14 || character.input.resolution !== '4K') {
  console.log('FAIL character refs', character.input.image_urls?.length, character.input.resolution)
  process.exitCode = 1
} else if (location.endpoint !== 'fal-ai/nano-banana-2' || location.input.resolution !== '1K') {
  console.log('FAIL location')
  process.exitCode = 1
} else if (flux.input.image_size !== 'landscape_16_9' || 'aspect_ratio' in flux.input) {
  console.log('FAIL flux size')
  process.exitCode = 1
} else if (!threw) {
  console.log('FAIL short prompt was accepted')
  process.exitCode = 1
} else if (core.VIDEO_MODEL_REGISTRY['nano-banana'] || core.VIDEO_MODEL_REGISTRY['flux-dev']) {
  console.log('FAIL image model entered the video registry')
  process.exitCode = 1
} else {
  console.log('PASS separate image builder, 14 ref cap, not in the video registry')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('image models validated; generation not run')
