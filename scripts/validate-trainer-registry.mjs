/**
 * TR-01: trainer registry shape. No FAL submit.
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

const cast = core.primaryCastTrainer()
if (cast.id !== 'minimax/h3/ref2va/trainer' || cast.trains !== 'character') {
  fail('primary cast', cast)
} else console.log('PASS primary cast trainer is H3 ref2va')

if (cast.costPerStep !== 0.015) fail('ref2va cost', cast.costPerStep)
else console.log('PASS ref2va cost from llms.txt (0.015/step)')

const h3t2v = core.loraPassFor('minimax/h3/text-to-video/lora')
if (!h3t2v || h3t2v.field !== 'loras' || h3t2v.itemPath !== 'path' || !h3t2v.required) {
  fail('h3 lora pass', h3t2v)
} else console.log('PASS H3 LoRA is required loras[].path + trigger in prompt')

const wan = core.loraPassFor('fal-ai/wan-i2v-lora')
if (!wan || wan.field !== 'loras' || wan.required) fail('wan lora pass', wan)
else console.log('PASS Wan i2v LoRA is optional loras[].path')

const missing = core.trainerDef('wan-22-image')
if (missing) fail('wan-22 removed', missing)
else console.log('PASS Wan 2.2 image trainer removed — no verified image LoRA inference id')

if (!core.UNVERIFIED_ENDPOINT_IDS.includes('fal-ai/elevenlabs/voice-clone')) {
  fail('elevenlabs clone', core.UNVERIFIED_ENDPOINT_IDS)
} else console.log('PASS ElevenLabs clone/design not on FAL (direct API)')

if (core.VOICE_CLONE_ON_FAL.minimaxVoiceClone !== 'fal-ai/minimax/voice-clone') {
  fail('minimax clone', core.VOICE_CLONE_ON_FAL)
} else console.log('PASS MiniMax voice clone on FAL')

const live = Object.values(core.TRAINER_REGISTRY).map((row) => row.id)
if (live.includes('fal-ai/flux-lora-fast-trainer')) fail('404 id shipped', live)
else console.log('PASS no 404 catalog aliases in live trainer ids')

const flux = core.trainerDef('flux-fast')
if (!flux) fail('flux-fast missing', flux)
else {
  const cost = core.trainingCostUsd(flux, 1000)
  if (cost !== 2) fail('flux cost 1000 steps', cost)
  else console.log('PASS flux-fast 1000 steps = $2')

  const tooFew = core.validateTrainingSet(flux, [{ name: 'a.jpg', kind: 'image' }])
  if (!tooFew.some((e) => e.includes('at least 10'))) fail('min items', tooFew)
  else console.log('PASS dataset minItems rejects short sets')

  const noTrigger = core.validateTrainingSet(
    flux,
    Array.from({ length: 10 }, (_, i) => ({ name: `a${i}.jpg`, kind: 'image' })),
  )
  if (!noTrigger.some((e) => e.includes('trigger_word'))) fail('trigger required', noTrigger)
  else console.log('PASS flux-fast requires trigger_word')

  const names = core.zipEntryName({ name: 'face.png', kind: 'image' }, 0)
  if (names.media !== 'clip_001.png' || names.caption !== 'clip_001.txt') fail('zip names', names)
  else console.log('PASS zip pairs media + caption basename')

  const payload = core.buildTrainerInput(flux, 'https://example.com/set.zip', {
    triggerPhrase: 'sks person',
    steps: 1000,
  })
  if (
    payload.images_data_url !== 'https://example.com/set.zip' ||
    payload.steps !== 1000 ||
    payload.trigger_word !== 'sks person' ||
    payload.number_of_steps
  ) {
    fail('buildTrainerInput flux', payload)
  } else console.log('PASS flux trainer input uses images_data_url + steps')

  const h3 = core.trainerDef('h3-t2v')
  const h3Input = core.buildTrainerInput(h3, 'https://example.com/set.zip', {
    triggerPhrase: 'my style',
    steps: 800,
  })
  if (h3Input.training_data_url !== 'https://example.com/set.zip' || h3Input.number_of_steps !== 800) {
    fail('buildTrainerInput h3', h3Input)
  } else console.log('PASS H3 trainer input uses training_data_url + number_of_steps')

  if (!core.costsMatch(2, 2.009) || core.costsMatch(2, 2.02)) fail('costsMatch', { a: core.costsMatch(2, 2.009), b: core.costsMatch(2, 2.02) })
  else console.log('PASS costsMatch epsilon 0.01')

  if (core.captionForFile({ name: 'a.jpg', kind: 'image' }, 'tok') !== 'tok') fail('caption fallback')
  else console.log('PASS uncaptioned file uses trigger phrase')
}

const loraPayload = { prompt: 'a portrait' }
core.applyLoraPass('minimax/h3/text-to-video/lora', loraPayload, 'prompt', [{
  loraUrl: 'https://example.com/char.safetensors',
  triggerPhrase: 'sks person',
  loraInference: 'minimax/h3/text-to-video/lora',
}])
if (
  loraPayload.prompt !== 'sks person, a portrait'
  || !Array.isArray(loraPayload.loras)
  || loraPayload.loras[0]?.path !== 'https://example.com/char.safetensors'
) {
  fail('applyLoraPass', loraPayload)
} else console.log('PASS applyLoraPass writes loras[].path and trigger first')

const built = core.buildPayload('minimax/h3/text-to-video/lora', {
  prompt: 'a portrait',
  duration: 5,
  characterLora: {
    loraUrl: 'https://example.com/char.safetensors',
    triggerPhrase: 'tok',
    loraInference: 'minimax/h3/text-to-video/lora',
  },
}, {
  endpoint: 'minimax/h3/text-to-video/lora',
  required: ['prompt'],
  forbidden: [],
  enums: {},
  types: { prompt: 'string', duration: 'number' },
  audioField: null,
  schemaHash: 'x',
  fetchedAt: 0,
  properties: ['prompt', 'duration', 'loras'],
})
if (built.prompt !== 'tok, a portrait' || built.loras?.[0]?.path !== 'https://example.com/char.safetensors') {
  fail('buildPayload lora', built)
} else console.log('PASS buildPayload applies LoRA on /lora endpoint')

const skipped = core.buildPayload('fal-ai/veo3.1', {
  prompt: 'a portrait',
  duration: 5,
  characterLora: {
    loraUrl: 'https://example.com/char.safetensors',
    triggerPhrase: 'tok',
    loraInference: 'minimax/h3/text-to-video/lora',
  },
}, {
  endpoint: 'fal-ai/veo3.1',
  required: ['prompt'],
  forbidden: [],
  enums: {},
  types: { prompt: 'string' },
  audioField: null,
  schemaHash: 'x',
  fetchedAt: 0,
  properties: ['prompt'],
})
if (skipped.loras || skipped.prompt !== 'a portrait') fail('veo rejects foreign lora', skipped)
else console.log('PASS LoRA is not applied on a non-LoRA endpoint')

if (!core.isLoraCapableEndpoint('minimax/h3/text-to-video/lora')) fail('lora capable mark')
else console.log('PASS model-knowledge index marks /lora endpoints as LoRA-capable')

const castPick = core.recommendTrainer({ tab: 'cast', subcategory: 'lead' })
if (castPick.trainerKey !== 'h3-ref2va') fail('cast trainer', castPick)
else console.log('PASS cast tab recommends h3-ref2va')

const stylePick = core.recommendTrainer({ tab: 'styles', kinds: ['video'] })
if (stylePick.trainerKey !== 'h3-t2v') fail('style trainer', stylePick)
else console.log('PASS styles + video recommends h3-t2v')

const styleImage = core.recommendTrainer({ tab: 'styles', kinds: ['image'] })
if (styleImage.trainerKey !== 'flux-2') fail('style image trainer', styleImage)
else console.log('PASS styles + image recommends flux-2')

const musicPick = core.recommendTrainer({ tab: 'music', subcategory: 'score' })
if (musicPick.trainerKey !== 'stable-audio-3') fail('music trainer', musicPick)
else console.log('PASS music tab recommends stable-audio-3')

const animeVideo = core.recommendTrainer({ tab: 'styles', subcategory: 'anime', kinds: ['video'] })
if (animeVideo.trainerKey !== 'ltx-23-video') fail('anime video trainer', animeVideo)
else console.log('PASS anime + video recommends ltx-23-video')

if (core.GENRE_PRESETS.length !== 36) fail('preset count', core.GENRE_PRESETS.length)
else console.log('PASS 36 instant genre presets')

const catalog = JSON.stringify(core.GENRE_PRESETS).toLowerCase()
if (catalog.includes('ghibli') || catalog.includes('disney') || catalog.includes('pixar')) fail('brand preset')
else console.log('PASS no brand-replication presets')

if (core.PLATFORM_TRAINS_ON_USER_CONTENT) fail('platform repurpose')
else console.log('PASS platform does not train on user content')

try {
  core.assertTrainingConsent({ tab: 'styles', subcategory: 'anime', ownedOrLicensed: false })
  fail('anime consent should block')
} catch (err) {
  if (err?.name !== 'TrainingConsentError') fail('consent error type', err)
  else console.log('PASS anime training blocked without own/licensed consent')
}

try {
  core.assertTrainingConsent({ tab: 'cast', subjectConsent: false })
  fail('face consent should block')
} catch (err) {
  if (err?.name !== 'TrainingConsentError') fail('face consent type', err)
  else console.log('PASS face LoRA blocked without subject consent')
}

const styled = core.composeShotPrompt('a rider turns', [], null, null, undefined, core.genreStyleFragment('movie.action'))
if (!styled.includes('Look:') || !styled.includes('Grade:')) fail('style fragment', styled)
else console.log('PASS composeShotPrompt appends instant preset look + grade')

if (core.STUDIO_TABS.join(',') !== 'cast,styles,assets,voices,music') fail('tabs', core.STUDIO_TABS)
else console.log('PASS Training Studio tabs are Cast/Styles/Assets/Voices/Music')

if (process.exitCode) process.exit(process.exitCode)
console.log('trainer registry inspected; generation not run')
