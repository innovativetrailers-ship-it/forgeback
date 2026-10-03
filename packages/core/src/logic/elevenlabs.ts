import { PayloadError } from './payload'

/**
 * ElevenLabs on FAL. Audio provider path — not the video mode router.
 * OpenAPI probed 2026-09-25. Schema wins over FAMILY-12.
 *
 * Live (200):
 *   fal-ai/elevenlabs/tts/eleven-v3 — required text. voice, stability 0-1, timestamps.
 *     Prompt maxLength 5000. No similarity_boost on v3.
 *   fal-ai/elevenlabs/tts/multilingual-v2, tts/turbo-v2.5 — required text.
 *     Extra fields: similarity_boost, style, speed 0.7-1.2.
 *   fal-ai/elevenlabs/text-to-dialogue/eleven-v3 — required inputs[].
 *     Each block is { text, voice } — not voice_id.
 *   fal-ai/elevenlabs/clone-voice — required audio_urls. Optional remove_background_noise.
 *     $0.50/clone. voice-cloner / voice-clone / audio-to-voice — 404.
 *   fal-ai/elevenlabs/sound-effects — required text (max 450). duration_seconds, prompt_influence.
 *   fal-ai/elevenlabs/music — prompt or composition_plan. music_length_ms, force_instrumental.
 *     music/v2 and music/v2.5 also 200. Not this id.
 *   fal-ai/elevenlabs/dubbing — required target_lang. audio_url or video_url.
 *   fal-ai/elevenlabs/voice-changer — required audio_url. Optional voice. speech-to-speech — 404.
 *   fal-ai/elevenlabs/speech-to-text — required audio_url. diarize, tag_audio_events.
 *   fal-ai/elevenlabs/audio-isolation — audio_url or video_url.
 *   fal-ai/elevenlabs/forced-alignment — required audio_url + text. Words have start/end seconds.
 *
 * Unverified (404): voice-design, text-to-voice, voice-cloner, audio-to-voice, speech-to-speech.
 * Voice design stays on the direct ElevenLabs API until a FAL id returns 200.
 * Overlay still silences video generate_audio except Grok. Omni has no audio field.
 */

export const ELEVENLABS_TTS = 'fal-ai/elevenlabs/tts/eleven-v3'
export const ELEVENLABS_TTS_MULTILINGUAL = 'fal-ai/elevenlabs/tts/multilingual-v2'
export const ELEVENLABS_TTS_TURBO = 'fal-ai/elevenlabs/tts/turbo-v2.5'
export const ELEVENLABS_DIALOGUE = 'fal-ai/elevenlabs/text-to-dialogue/eleven-v3'
export const ELEVENLABS_CLONE = 'fal-ai/elevenlabs/clone-voice'
export const ELEVENLABS_SFX = 'fal-ai/elevenlabs/sound-effects'
export const ELEVENLABS_MUSIC = 'fal-ai/elevenlabs/music'
export const ELEVENLABS_DUBBING = 'fal-ai/elevenlabs/dubbing'
export const ELEVENLABS_S2S = 'fal-ai/elevenlabs/voice-changer'
export const ELEVENLABS_STT = 'fal-ai/elevenlabs/speech-to-text'
export const ELEVENLABS_ISOLATE = 'fal-ai/elevenlabs/audio-isolation'
export const ELEVENLABS_ALIGN = 'fal-ai/elevenlabs/forced-alignment'

export const audioModels = {
  tts: ELEVENLABS_TTS,
  dialogue: ELEVENLABS_DIALOGUE,
  voiceClone: ELEVENLABS_CLONE,
  sfx: ELEVENLABS_SFX,
  music: ELEVENLABS_MUSIC,
  dubbing: ELEVENLABS_DUBBING,
  s2s: ELEVENLABS_S2S,
  stt: ELEVENLABS_STT,
  isolate: ELEVENLABS_ISOLATE,
  align: ELEVENLABS_ALIGN,
} as const

export const ELEVENLABS_ENDPOINTS = audioModels

export const ELEVENLABS_VERIFIED_NOT_THIS_ID = {
  musicV2: 'fal-ai/elevenlabs/music/v2',
  musicV25: 'fal-ai/elevenlabs/music/v2.5',
  ttsV3Stream: 'fal-ai/elevenlabs/tts/eleven-v3/stream',
} as const

export const ELEVENLABS_UNVERIFIED_IDS = [
  'fal-ai/elevenlabs/voice-clone',
  'fal-ai/elevenlabs/voice-cloner',
  'fal-ai/elevenlabs/voice-design',
  'fal-ai/elevenlabs/text-to-voice',
  'fal-ai/elevenlabs/audio-to-voice',
  'fal-ai/elevenlabs/speech-to-speech',
] as const

export const ELEVENLABS_TTS_MAX = 5000
export const ELEVENLABS_SFX_MAX = 450
export const ELEVENLABS_OUTPUT = 'mp3_44100_128' as const
export const ELEVENLABS_OUTPUT_FORMATS = [
  'mp3_22050_32', 'mp3_44100_32', 'mp3_44100_64', 'mp3_44100_96',
  'mp3_44100_128', 'mp3_44100_192', 'pcm_8000', 'pcm_16000', 'pcm_22050',
  'pcm_24000', 'pcm_44100', 'pcm_48000', 'ulaw_8000', 'alaw_8000',
  'opus_48000_32', 'opus_48000_64', 'opus_48000_96', 'opus_48000_128', 'opus_48000_192',
] as const

export type ElevenLabsKind =
  | 'tts'
  | 'tts_multilingual'
  | 'tts_turbo'
  | 'dialogue'
  | 'clone'
  | 'sfx'
  | 'music'
  | 'dubbing'
  | 's2s'
  | 'stt'
  | 'isolate'
  | 'align'

export interface DialogueTurn {
  text: string
  voice: string
}

export interface AudioBuildRequest {
  text?: string
  voice?: string
  stability?: number
  similarityBoost?: number
  style?: number
  speed?: number
  languageCode?: string
  timestamps?: boolean
  inputs?: DialogueTurn[]
  audioUrls?: string[]
  audioUrl?: string
  videoUrl?: string
  removeBackgroundNoise?: boolean
  durationSeconds?: number
  promptInfluence?: number
  outputFormat?: string
  prompt?: string
  forceInstrumental?: boolean
  musicLengthMs?: number
  targetLang?: string
  sourceLang?: string
  numSpeakers?: number
  diarize?: boolean
  tagAudioEvents?: boolean
}

export interface AudioBuilt {
  endpoint: string
  payload: Record<string, unknown>
}

function clamp01(value: number | undefined, fallback: number): number {
  if (value == null || !Number.isFinite(value)) return fallback
  return Math.min(1, Math.max(0, value))
}

function snapFormat(value: string | undefined): string {
  if (value && (ELEVENLABS_OUTPUT_FORMATS as readonly string[]).includes(value)) return value
  return ELEVENLABS_OUTPUT
}

function voiceOf(value: string | undefined): string {
  const voice = value?.trim()
  if (!voice) throw new PayloadError('elevenlabs requires a voice')
  return voice
}

function textOf(value: string | undefined, max: number, label: string): string {
  const text = value?.trim() ?? ''
  if (!text) throw new PayloadError(`${label} requires text`)
  return text.length > max ? text.slice(0, max) : text
}

function urlOf(value: string | undefined, label: string): string {
  const url = value?.trim() ?? ''
  if (!url) throw new PayloadError(`${label} requires a url`)
  return url
}

export function buildAudioPayload(kind: ElevenLabsKind, req: AudioBuildRequest): AudioBuilt {
  if (kind === 'tts' || kind === 'tts_multilingual' || kind === 'tts_turbo') {
    const endpoint = kind === 'tts'
      ? ELEVENLABS_TTS
      : kind === 'tts_turbo'
        ? ELEVENLABS_TTS_TURBO
        : ELEVENLABS_TTS_MULTILINGUAL
    const payload: Record<string, unknown> = {
      text: textOf(req.text, ELEVENLABS_TTS_MAX, 'elevenlabs tts'),
      voice: voiceOf(req.voice),
      stability: clamp01(req.stability, 0.5),
    }
    if (req.languageCode?.trim()) payload.language_code = req.languageCode.trim()
    if (req.timestamps) payload.timestamps = true
    if (kind !== 'tts') {
      payload.similarity_boost = clamp01(req.similarityBoost, 0.75)
      payload.style = clamp01(req.style, 0)
      if (req.speed != null && Number.isFinite(req.speed)) {
        payload.speed = Math.min(1.2, Math.max(0.7, req.speed))
      }
    }
    return { endpoint, payload }
  }

  if (kind === 'dialogue') {
    const inputs = (req.inputs ?? [])
      .map((turn) => ({ text: turn.text.trim(), voice: turn.voice.trim() }))
      .filter((turn) => turn.text && turn.voice)
    if (inputs.length < 2) throw new PayloadError('elevenlabs dialogue requires two or more speaker turns')
    const payload: Record<string, unknown> = { inputs }
    if (req.stability != null) payload.stability = clamp01(req.stability, 0.5)
    if (req.languageCode?.trim()) payload.language_code = req.languageCode.trim()
    return { endpoint: ELEVENLABS_DIALOGUE, payload }
  }

  if (kind === 'clone') {
    const audioUrls = (req.audioUrls ?? []).map((url) => url.trim()).filter(Boolean)
    if (!audioUrls.length) throw new PayloadError('elevenlabs clone-voice requires audio_urls')
    const payload: Record<string, unknown> = { audio_urls: audioUrls }
    if (req.removeBackgroundNoise != null) payload.remove_background_noise = req.removeBackgroundNoise
    return { endpoint: ELEVENLABS_CLONE, payload }
  }

  if (kind === 'sfx') {
    const payload: Record<string, unknown> = {
      text: textOf(req.text ?? req.prompt, ELEVENLABS_SFX_MAX, 'elevenlabs sfx'),
      output_format: snapFormat(req.outputFormat),
      prompt_influence: clamp01(req.promptInfluence, 0.3),
    }
    if (req.durationSeconds != null && Number.isFinite(req.durationSeconds)) {
      payload.duration_seconds = Math.min(30, Math.max(0.5, req.durationSeconds))
    }
    return { endpoint: ELEVENLABS_SFX, payload }
  }

  if (kind === 'music') {
    const prompt = req.prompt?.trim() || req.text?.trim()
    if (!prompt) throw new PayloadError('elevenlabs music requires a prompt')
    const payload: Record<string, unknown> = {
      prompt: prompt.slice(0, 4100),
      force_instrumental: req.forceInstrumental === true,
      output_format: snapFormat(req.outputFormat),
    }
    if (req.musicLengthMs != null && Number.isFinite(req.musicLengthMs)) {
      payload.music_length_ms = Math.max(1, Math.round(req.musicLengthMs))
    }
    return { endpoint: ELEVENLABS_MUSIC, payload }
  }

  if (kind === 'dubbing') {
    const targetLang = req.targetLang?.trim()
    if (!targetLang) throw new PayloadError('elevenlabs dubbing requires target_lang')
    const audioUrl = req.audioUrl?.trim()
    const videoUrl = req.videoUrl?.trim()
    if (!audioUrl && !videoUrl) throw new PayloadError('elevenlabs dubbing requires audio_url or video_url')
    const payload: Record<string, unknown> = { target_lang: targetLang }
    if (audioUrl) payload.audio_url = audioUrl
    if (videoUrl) payload.video_url = videoUrl
    if (req.sourceLang?.trim()) payload.source_lang = req.sourceLang.trim()
    if (req.numSpeakers != null && Number.isFinite(req.numSpeakers)) {
      payload.num_speakers = Math.min(50, Math.max(1, Math.round(req.numSpeakers)))
    }
    return { endpoint: ELEVENLABS_DUBBING, payload }
  }

  if (kind === 's2s') {
    const payload: Record<string, unknown> = {
      audio_url: urlOf(req.audioUrl, 'elevenlabs voice-changer'),
      voice: voiceOf(req.voice),
      output_format: snapFormat(req.outputFormat),
    }
    if (req.removeBackgroundNoise != null) payload.remove_background_noise = req.removeBackgroundNoise
    return { endpoint: ELEVENLABS_S2S, payload }
  }

  if (kind === 'stt') {
    const payload: Record<string, unknown> = {
      audio_url: urlOf(req.audioUrl, 'elevenlabs speech-to-text'),
      diarize: req.diarize !== false,
      tag_audio_events: req.tagAudioEvents !== false,
    }
    if (req.languageCode?.trim()) payload.language_code = req.languageCode.trim()
    return { endpoint: ELEVENLABS_STT, payload }
  }

  if (kind === 'isolate') {
    const audioUrl = req.audioUrl?.trim()
    const videoUrl = req.videoUrl?.trim()
    if (!audioUrl && !videoUrl) throw new PayloadError('elevenlabs audio-isolation requires audio_url or video_url')
    const payload: Record<string, unknown> = {}
    if (audioUrl) payload.audio_url = audioUrl
    if (videoUrl) payload.video_url = videoUrl
    return { endpoint: ELEVENLABS_ISOLATE, payload }
  }

  if (kind === 'align') {
    return {
      endpoint: ELEVENLABS_ALIGN,
      payload: {
        audio_url: urlOf(req.audioUrl, 'elevenlabs forced-alignment'),
        text: textOf(req.text, 675000, 'elevenlabs forced-alignment'),
      },
    }
  }

  throw new PayloadError(`unknown elevenlabs kind '${kind as string}'`)
}

export interface VoiceModelResolution {
  kind: 'tts' | 'tts_turbo'
  requested: string
  applied: 'eleven_v3' | 'turbo'
  reason: string
}

/** Live OpenAPI 200: eleven-v3 and turbo-v2.5. A flash id returns 404. */
export function resolveVoiceModel(requested: string | undefined): VoiceModelResolution {
  const asked = (requested ?? 'eleven_v3').trim() || 'eleven_v3'
  if (asked === 'flash') {
    return {
      kind: 'tts_turbo',
      requested: asked,
      applied: 'turbo',
      reason: 'flash is not a live speech endpoint; speed uses turbo-v2.5',
    }
  }
  if (asked !== 'eleven_v3') {
    return {
      kind: 'tts',
      requested: asked,
      applied: 'eleven_v3',
      reason: 'unknown voice model; using eleven-v3',
    }
  }
  return { kind: 'tts', requested: asked, applied: 'eleven_v3', reason: 'eleven-v3' }
}

export function buildVoiceTakePayload(input: {
  text: string
  voice: string
  model?: string
  stability?: number
  similarity?: number
  style?: number
  speed?: number
  emotion?: number
}): AudioBuilt & { model: VoiceModelResolution } {
  const model = resolveVoiceModel(input.model)
  console.log('[voice_model]', JSON.stringify(model))
  const stability = input.stability ?? 0.5
  const similarity = input.similarity ?? 0.75
  const style = input.style ?? 0
  const speed = input.speed ?? 1
  const emotion = input.emotion ?? 0.5
  if (emotion !== 0.5) {
    console.log('[voice_param]', JSON.stringify({ field: 'emotion', requested: emotion, applied: 'omitted', reason: 'live speech schema has no emotion field' }))
  }
  if (model.kind === 'tts') {
    if (similarity !== 0.75) {
      console.log('[voice_param]', JSON.stringify({ field: 'similarity', requested: similarity, applied: 'omitted', reason: 'eleven-v3 has no similarity_boost' }))
    }
    if (style !== 0) {
      console.log('[voice_param]', JSON.stringify({ field: 'style', requested: style, applied: 'omitted', reason: 'eleven-v3 has no style' }))
    }
    if (speed !== 1) {
      console.log('[voice_param]', JSON.stringify({ field: 'speed', requested: speed, applied: 'omitted', reason: 'eleven-v3 has no speed' }))
    }
  }
  const built = buildAudioPayload(model.kind, {
    text: input.text,
    voice: input.voice,
    stability,
    similarityBoost: similarity,
    style,
    speed,
    timestamps: true,
  })
  return { ...built, model }
}

export type AudioPath = 'native' | 'elevenlabs'

export interface AudioRouteInput {
  videoModel?: string
  needsDialogue?: boolean
  speakerCount?: number
  wantsCloneOrDesign?: boolean
  wantsDubbing?: boolean
  wantsLipSync?: boolean
  wantsQualityVoice?: boolean
}

export interface AudioRoute {
  path: AudioPath
  reason: string
  kind?: ElevenLabsKind
}

/** Overlay: dispatch silences every video model except Grok. Omni has no audio toggle. */
export function routeShotAudio(input: AudioRouteInput): AudioRoute {
  const model = (input.videoModel ?? '').trim()
  const speakers = input.speakerCount ?? 0
  const wantsToolkit = Boolean(
    input.wantsCloneOrDesign
    || input.wantsDubbing
    || input.wantsLipSync
    || input.wantsQualityVoice
    || speakers >= 2,
  )
  const grok = /grok/i.test(model)
  const omni = /gemini-omni|omni-flash/i.test(model)
  if (wantsToolkit) {
    const kind: ElevenLabsKind = input.wantsDubbing
      ? 'dubbing'
      : speakers >= 2
        ? 'dialogue'
        : input.wantsLipSync
          ? 'align'
          : 'tts'
    return {
      path: 'elevenlabs',
      kind,
      reason: speakers >= 2
        ? 'Multi-speaker dialogue uses ElevenLabs text-to-dialogue on FAL.'
        : input.wantsDubbing
          ? 'Dubbing uses ElevenLabs on FAL.'
          : input.wantsLipSync
            ? 'Lip-sync timing uses ElevenLabs forced-alignment on FAL.'
            : 'Voice quality uses ElevenLabs on FAL.',
    }
  }
  if (grok) {
    return { path: 'native', reason: 'Grok is the one video model whose native audio cannot be switched off.' }
  }
  if (omni) {
    return {
      path: 'native',
      reason: 'Omni has no generate_audio field, so native audio stays in the generation pass when no ElevenLabs toolkit is needed.',
    }
  }
  if (input.needsDialogue) {
    return {
      path: 'elevenlabs',
      kind: 'tts',
      reason: 'This video model is silenced on submit. Dialogue uses ElevenLabs on FAL.',
    }
  }
  return { path: 'native', reason: 'No dialogue toolkit needed; picture stays silent and ElevenLabs is not called.' }
}

export function alignmentWords(
  data: unknown,
): Array<{ text: string; start: number; end: number }> {
  if (!data || typeof data !== 'object') return []
  const words = (data as { words?: Array<{ text?: string; start?: number; end?: number }> }).words
  if (!Array.isArray(words)) return []
  return words.flatMap((word) => {
    const text = word.text?.trim() ?? ''
    if (!text || word.start == null || word.end == null) return []
    return [{ text, start: word.start, end: word.end }]
  })
}

export function clonedVoiceId(data: unknown): string {
  if (!data || typeof data !== 'object') throw new PayloadError('elevenlabs clone-voice returned no voice_id')
  const id = (data as { voice_id?: unknown }).voice_id
  if (typeof id !== 'string' || !id.trim()) throw new PayloadError('elevenlabs clone-voice returned no voice_id')
  return id.trim()
}
