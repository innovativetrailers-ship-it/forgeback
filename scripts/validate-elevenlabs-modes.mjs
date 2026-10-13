/**
 * Validate ElevenLabs-on-FAL payloads against live OpenAPI inputs.
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
  if (errors.length) {
    console.log('FAIL', label, errors.join('; '))
    process.exitCode = 1
    return
  }
  console.log('PASS', label)
}

const tts = core.buildAudioPayload('tts', {
  text: 'Rain on the diner glass.',
  voice: 'Rachel',
  stability: 0.5,
  similarityBoost: 0.9,
})
const dialogue = core.buildAudioPayload('dialogue', {
  inputs: [
    { text: 'Did you hear that?', voice: 'Aria' },
    { text: 'Keep walking.', voice: 'Roger' },
  ],
})
const clone = core.buildAudioPayload('clone', {
  audioUrls: ['https://example.com/sample.mp3'],
  removeBackgroundNoise: true,
})
const sfx = core.buildAudioPayload('sfx', { text: 'Heavy boots on wet concrete.', durationSeconds: 4 })
const music = core.buildAudioPayload('music', { prompt: 'Quiet noir score, bass and brushes.', forceInstrumental: true, musicLengthMs: 8000 })
const align = core.buildAudioPayload('align', { audioUrl: 'https://example.com/line.mp3', text: 'Did you hear that?' })
const s2s = core.buildAudioPayload('s2s', { audioUrl: 'https://example.com/read.mp3', voice: 'Aria' })
const dub = core.buildAudioPayload('dubbing', { videoUrl: 'https://example.com/clip.mp4', targetLang: 'es' })
const stt = core.buildAudioPayload('stt', { audioUrl: 'https://example.com/line.mp3' })
const isolate = core.buildAudioPayload('isolate', { audioUrl: 'https://example.com/line.mp3' })

const schemas = {}
for (const [label, built] of Object.entries({
  tts, dialogue, clone, sfx, music, align, s2s, dub, stt, isolate,
})) {
  schemas[label] = await inputSchema(built.endpoint)
  check(label, built.payload, schemas[label])
}

if (tts.endpoint !== core.audioModels.tts || 'similarity_boost' in tts.payload || tts.payload.voice !== 'Rachel') {
  console.log('FAIL tts v3 field map', tts)
  process.exitCode = 1
} else if (dialogue.payload.inputs[0].voice_id != null || dialogue.payload.inputs[0].voice !== 'Aria') {
  console.log('FAIL dialogue uses voice not voice_id', dialogue.payload)
  process.exitCode = 1
} else if (clone.endpoint !== 'fal-ai/elevenlabs/clone-voice') {
  console.log('FAIL clone id', clone.endpoint)
  process.exitCode = 1
} else if (s2s.endpoint !== 'fal-ai/elevenlabs/voice-changer') {
  console.log('FAIL s2s id', s2s.endpoint)
  process.exitCode = 1
} else if ('duration' in sfx.payload || sfx.payload.duration_seconds !== 4) {
  console.log('FAIL sfx duration field', sfx.payload)
  process.exitCode = 1
} else {
  console.log('PASS v3 has no similarity_boost, dialogue.voice, clone-voice, voice-changer, duration_seconds')
}

const live = new Set(Object.values(core.audioModels))
for (const id of core.ELEVENLABS_UNVERIFIED_IDS) {
  if (live.has(id)) {
    console.log('FAIL unverified id in live registry', id)
    process.exitCode = 1
  }
}
if (!process.exitCode) console.log('PASS unverified voice-design/voice-cloner/speech-to-speech are not registered')

const nativeGrok = core.routeShotAudio({ videoModel: 'grok-imagine-video' })
const mixVeo = core.routeShotAudio({ videoModel: 'veo-3.1', needsDialogue: true })
const lipsyncOmni = core.routeShotAudio({ videoModel: 'gemini-omni', wantsLipSync: true })
if (nativeGrok.path !== 'native' || mixVeo.path !== 'elevenlabs' || lipsyncOmni.path !== 'elevenlabs') {
  console.log('FAIL audio route', nativeGrok, mixVeo, lipsyncOmni)
  process.exitCode = 1
} else {
  console.log('PASS grok native, veo dialogue elevenlabs, omni lip-sync elevenlabs')
}

if (process.exitCode) process.exit(process.exitCode)
console.log('elevenlabs audio modes validated; generation not run')
