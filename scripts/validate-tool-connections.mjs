/**
 * Inspect image and frame fields on sealed payloads. No FAL submit.
 */
import path from 'path'
import { createRequire } from 'module'
import { fileURLToPath } from 'url'

const requireCore = createRequire(fileURLToPath(import.meta.url))
const __dirname = path.dirname(fileURLToPath(import.meta.url))
const core = requireCore(path.join(__dirname, '../packages/core/dist/index.js'))

function fail(label, detail) {
  console.log('FAIL', label, detail)
  process.exitCode = 1
}

function pass(label) {
  console.log('PASS', label)
}

const MAYA = 'https://example.com/maya.jpg'
const END = 'https://example.com/end.jpg'
const LINE = 'https://example.com/line.mp3'

const composition = core.selectReferences([
  { url: MAYA, label: 'Maya', bucket: 'image', role: 'character', primary: true },
  { url: LINE, label: 'Maya line', bucket: 'audio', role: 'dialogue' },
])
const seedanceRef = core.buildSeedancePayload({
  mode: 'reference',
  prompt: 'Maya walks into the diner.',
  composition,
})
const seedanceFrames = core.buildSeedancePayload({
  mode: 'first_last',
  prompt: 'Maya walks into the diner.',
  imageUrl: MAYA,
  endImageUrl: END,
})
const kling = core.buildKlingPayload({
  mode: 'first_last',
  prompt: 'Maya walks into the diner.',
  imageUrl: MAYA,
  endImageUrl: END,
  negativePrompt: 'blur',
  elements: [{ frontal_image_url: MAYA }],
})
const veoFrames = core.buildVeoPayload({
  mode: 'first_last',
  prompt: 'Maya walks into the diner.',
  imageUrl: MAYA,
  endImageUrl: END,
  negativePrompt: 'blur',
  seed: 7,
})
const veoRef = core.buildVeoPayload({
  mode: 'reference',
  prompt: 'Maya walks into the diner.',
  imageUrls: [MAYA],
  negativePrompt: 'blur',
  seed: 7,
})
const wan = core.buildWanPayload({
  mode: 'reference',
  prompt: 'Maya walks into the diner.',
  imageUrls: [MAYA],
  negativePrompt: 'blur',
  seed: 7,
})
const grok = core.buildGrokPayload({
  mode: 'reference',
  prompt: 'Maya walks into the diner.',
  imageUrls: [MAYA],
  names: ['Maya'],
})
const ltx = core.buildLtxPayload({
  kind: 'image',
  prompt: 'Maya walks into the diner.',
  imageUrl: MAYA,
  endImageUrl: END,
})
const hailuo = core.buildHailuoPayload({
  kind: 'pro_image',
  prompt: 'Maya walks into the diner.',
  imageUrl: MAYA,
  endImageUrl: END,
})
const pixverse = core.buildPixversePayload({
  kind: 'v56_transition',
  prompt: 'Maya walks into the diner.',
  imageUrl: MAYA,
  endImageUrl: END,
  negativePrompt: 'blur',
  seed: 7,
})
const horse = core.buildHappyHorsePayload({
  kind: 'reference',
  prompt: 'Maya walks into the diner.',
  imageUrls: [MAYA],
  names: ['Maya'],
  seed: 7,
})

if (seedanceRef.image_urls?.[0] !== MAYA || !seedanceRef.audio_urls?.includes(LINE) || !String(seedanceRef.prompt).includes('@Audio1') || seedanceRef.generate_audio !== false || 'seed' in seedanceRef) {
  fail('seedance reference', seedanceRef)
} else pass('seedance reference reaches image_urls and @Audio')

if (seedanceFrames.image_url !== MAYA || seedanceFrames.end_image_url !== END || 'image_urls' in seedanceFrames) {
  fail('seedance frames', seedanceFrames)
} else pass('seedance last frame is end_image_url')

if (kling.start_image_url !== MAYA || kling.end_image_url !== END || kling.negative_prompt !== 'blur' || !kling.elements || 'seed' in kling || 'voice_id' in kling || kling.generate_audio !== false) {
  fail('kling', kling)
} else pass('kling frames, elements, and negative; no voice_id')

if (veoFrames.first_frame_url !== MAYA || veoFrames.last_frame_url !== END || veoFrames.seed !== 7 || veoFrames.negative_prompt !== 'blur' || veoFrames.generate_audio !== false) {
  fail('veo frames', veoFrames)
} else pass('veo first and last frames, seed, negative')

if (!veoRef.image_urls?.includes(MAYA) || 'seed' in veoRef || 'negative_prompt' in veoRef) {
  fail('veo reference', veoRef)
} else pass('veo reference omits seed and negative')

if (!wan.reference_image_urls?.includes(MAYA) || wan.seed !== 7 || wan.negative_prompt !== 'blur' || 'generate_audio' in wan) {
  fail('wan', wan)
} else pass('wan reference, seed, and negative')

if (!grok.reference_image_urls?.includes(MAYA) || 'generate_audio' in grok || 'seed' in grok || 'end_image_url' in grok) {
  fail('grok', grok)
} else pass('grok reference has no audio switch and no last frame')

if (ltx.image_url !== MAYA || ltx.end_image_url !== END || ltx.generate_audio !== false || 'seed' in ltx || 'reference_image_urls' in ltx) {
  fail('ltx', ltx)
} else pass('ltx last frame; no reference and no seed')

if (hailuo.image_url !== MAYA || hailuo.end_image_url !== END || 'image_urls' in hailuo || 'seed' in hailuo || 'audio_url' in hailuo) {
  fail('hailuo', hailuo)
} else pass('hailuo last frame; no reference')

if (pixverse.first_image_url !== MAYA || pixverse.end_image_url !== END || pixverse.generate_audio_switch !== false || pixverse.seed !== 7) {
  fail('pixverse', pixverse)
} else pass('pixverse transition frames and silent switch')

if (!horse.image_urls?.includes(MAYA) || horse.seed !== 7 || 'end_image_url' in horse) {
  fail('happyhorse', horse)
} else pass('happyhorse reference and seed; no last frame')

const seedance = core.exposedControls('seedance-2.0', core.SEEDANCE_FIELDS)
const klingCaps = core.exposedControls('kling-3.0', core.KLING_FIELDS)
const ltxCaps = core.exposedControls('ltx-2.3-fast', core.LTX_FIELDS)
const grokCaps = core.exposedControls('grok-imagine-video', core.GROK_FIELDS)
const hailuoCaps = core.exposedControls('hailuo-02', core.HAILUO_FIELDS)
const gemini = core.exposedControls('gemini-omni-flash')

if (seedance.voice !== 'audio_tag' || !seedance.reference || !seedance.lastFrame || seedance.seed || seedance.audioToggle) {
  fail('seedance controls', seedance)
} else if (klingCaps.voice !== 'none' || !klingCaps.reference || !klingCaps.lastFrame || !klingCaps.negative || klingCaps.seed || klingCaps.audioToggle) {
  fail('kling controls', klingCaps)
} else if (ltxCaps.reference || ltxCaps.voice !== 'none' || !ltxCaps.lastFrame || ltxCaps.seed) {
  fail('ltx controls', ltxCaps)
} else if (grokCaps.lastFrame || grokCaps.seed || grokCaps.audioToggle || !grokCaps.nativeAudioLockedOn || !grokCaps.reference) {
  fail('grok controls', grokCaps)
} else if (hailuoCaps.reference || hailuoCaps.voice !== 'none' || !hailuoCaps.lastFrame) {
  fail('hailuo controls', hailuoCaps)
} else if (gemini.voice !== 'none' || gemini.reference || gemini.lastFrame) {
  fail('gemini controls', gemini)
} else {
  pass('controls stay hidden where the schema has no field')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('tool connections inspected; generation not run')
