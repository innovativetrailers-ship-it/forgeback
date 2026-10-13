/**
 * ADX-4: code-net helpers. No FAL submit.
 */
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const requireCore = createRequire(fileURLToPath(import.meta.url))
const core = requireCore(path.join(path.dirname(fileURLToPath(import.meta.url)), '../packages/core/dist/index.js'))

function fail(label, detail) {
  console.log('FAIL', label, detail)
  process.exitCode = 1
}

try {
  core.asArray(undefined).map((n) => n)
} catch (err) {
  fail('asArray map', err)
}
if (core.asArray(undefined).length !== 0) fail('asArray empty', core.asArray(undefined))
else console.log('PASS asArray([]) before .map')

if (Object.keys(core.asRecord(null)).length !== 0) fail('asRecord', core.asRecord(null))
else console.log('PASS asRecord({}) for null')

const crash = core.interpretErrorRules("Cannot read properties of undefined (reading 'map')")
if (crash.category !== 'code_error') fail('code_error', crash)
else console.log('PASS undefined.map → code_error')

if (core.shotMode({ prompt: 'x', characterIds: ['c1'] }) !== 'reference') fail('shotMode ref')
else console.log('PASS shotMode reference')

if (core.shotMode({ prompt: 'rain' }) !== 'text') fail('shotMode text')
else console.log('PASS shotMode text')

const schema = {
  required: ['prompt'],
  properties: ['prompt', 'duration', 'generate_audio'],
  enums: { duration: ['4', '5'] },
}
const fit = core.payloadFitsSchema({ prompt: 'ok', duration: '5', generate_audio: false }, schema)
if (!fit.ok) fail('fits', fit)
else console.log('PASS payloadFitsSchema happy path')

const extra = core.payloadFitsSchema({ prompt: 'ok', seed: 1 }, schema)
if (extra.ok || !extra.extra.includes('seed')) fail('extra', extra)
else console.log('PASS unknown payload field is a contract fail')

const composition = core.selectReferences([
  { url: 'https://example.com/maya.jpg', label: 'Maya', bucket: 'image', role: 'character', primary: true },
])
const payload = core.buildSeedancePayload({
  mode: 'reference',
  prompt: 'Maya walks the diner',
  durationSec: 5,
  composition,
})
const seedanceSchema = {
  required: ['prompt'],
  properties: ['prompt', 'image_urls', 'video_urls', 'audio_urls', 'duration', 'resolution', 'aspect_ratio', 'generate_audio'],
}
const report = core.payloadFitsSchema(payload, seedanceSchema)
if (!report.ok) fail('seedance contract', report)
if (!String(payload.prompt).includes('@Image1')) fail('seedance tags', payload.prompt)
if ((payload.image_urls?.length ?? 0) > 12) fail('seedance cap', payload)
else console.log('PASS Seedance reference @-tags and ≤12 files, schema-valid')

if (core.capPromptText('one two three four', 10) !== 'one two') fail('cap', core.capPromptText('one two three four', 10))
else console.log('PASS capPromptText word boundary')

try {
  core.parseJsonObject('nope')
  fail('parseJsonObject should throw')
} catch {
  console.log('PASS malformed JSON is loud at the boundary')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('code net inspected; generation not run')
