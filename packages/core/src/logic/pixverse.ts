import type { FamilyFieldMap, Mode } from '../types/provider'
import { logPayloadClamp, PayloadError } from './payload'
import { cameraSentence, type PromptCamera } from './identity'
import type { ModeModel } from './modePipeline'

/**
 * PixVerse field map from OpenAPI on 2026-09-25.
 * fal-ai/pixverse/v5.6/text-to-video and image-to-video — 200.
 * fal-ai/pixverse/v5.6/transition — 200. Required first_image_url and end_image_url.
 * fal-ai/pixverse/v5.6/effects and reference-to-video — 404.
 * v5.5 text, image, and effects — 200. v5 and v3.5 text and image — 200.
 * v4.5 text and v4 image — 200. Those are what the old pixverse-v6 key still calls.
 * C1 text — 200 and is not this registry id. The pool stays the existing seven.
 * Duration is the string enum "5"|"8"|"10". 1080p cannot be "10".
 * Prompt and negative prompt are capped at 2048 UTF-8 bytes. There is no maxLength.
 * Audio field is generate_audio_switch. Submit sends false. There is no generate_audio.
 * thinking_type rewrites the prompt. Submit sends "disabled".
 * Image-to-video has no aspect_ratio and no last frame. There is no fusion field and no motion_mode.
 */

export const PIXVERSE_V56_TEXT = 'fal-ai/pixverse/v5.6/text-to-video'
export const PIXVERSE_V56_IMAGE = 'fal-ai/pixverse/v5.6/image-to-video'
export const PIXVERSE_V56_TRANSITION = 'fal-ai/pixverse/v5.6/transition'
export const PIXVERSE_V55_TEXT = 'fal-ai/pixverse/v5.5/text-to-video'
export const PIXVERSE_V55_IMAGE = 'fal-ai/pixverse/v5.5/image-to-video'
export const PIXVERSE_V55_EFFECTS = 'fal-ai/pixverse/v5.5/effects'
export const PIXVERSE_V45_TEXT = 'fal-ai/pixverse/v4.5/text-to-video'
export const PIXVERSE_V4_IMAGE = 'fal-ai/pixverse/v4/image-to-video'

export const PIXVERSE_ENDPOINTS: Partial<Record<Mode, string>> = {
  text: PIXVERSE_V56_TEXT,
  first_frame: PIXVERSE_V56_IMAGE,
  first_last: PIXVERSE_V56_TRANSITION,
}

export const PIXVERSE_DURATION = ['5', '8', '10'] as const
export const PIXVERSE_RESOLUTION = ['360p', '540p', '720p', '1080p'] as const
export const PIXVERSE_ASPECT = ['16:9', '4:3', '1:1', '3:4', '9:16'] as const
export const PIXVERSE_PROMPT_BYTES = 2048

export const PIXVERSE_FIELDS: FamilyFieldMap = {
  firstFrame: 'image_url',
  firstFrameForLast: 'first_image_url',
  lastFrame: 'end_image_url',
  references: { mode: 'field', max: 0 },
  duration: { field: 'duration', kind: 'enum', values: [...PIXVERSE_DURATION] },
  audio: { field: 'generate_audio_switch', kind: 'switch' },
  resolution: { field: 'resolution', values: [...PIXVERSE_RESOLUTION] },
  aspect: { field: 'aspect_ratio', values: [...PIXVERSE_ASPECT] },
  negative: 'negative_prompt',
  seed: 'seed',
}

export function pixverseModeModel(): ModeModel {
  return {
    id: 'pixverse-v5.6',
    provider: 'fal',
    endpoints: PIXVERSE_ENDPOINTS,
    fields: PIXVERSE_FIELDS,
    limits: { maxPromptChars: PIXVERSE_PROMPT_BYTES },
    nativeAudio: false,
  }
}

export function capUtf8Bytes(text: string, maxBytes: number): string {
  const trimmed = text.trim()
  if (Buffer.byteLength(trimmed, 'utf8') <= maxBytes) return trimmed
  let low = 0
  let high = trimmed.length
  while (low < high) {
    const mid = Math.ceil((low + high) / 2)
    if (Buffer.byteLength(trimmed.slice(0, mid), 'utf8') <= maxBytes) low = mid
    else high = mid - 1
  }
  const slice = trimmed.slice(0, low)
  const lastSpace = slice.lastIndexOf(' ')
  if (lastSpace >= Math.floor(slice.length * 0.6)) {
    const word = slice.slice(0, lastSpace).trim()
    if (word && Buffer.byteLength(word, 'utf8') <= maxBytes) return word
  }
  return slice.trim()
}

function nearestDuration(seconds: number | undefined, allowed: readonly string[]): string {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return allowed[0]
  const target = Math.round(seconds)
  let best = allowed[0]
  let distance = Infinity
  for (const value of allowed) {
    const n = Number(value)
    const gap = Math.abs(n - target)
    if (gap < distance || (gap === distance && n > Number(best))) {
      distance = gap
      best = value
    }
  }
  return best
}

export function pixverseDuration(seconds: number | undefined, resolution: string, long = true): string {
  const allowed = resolution === '1080p'
    ? (long ? PIXVERSE_DURATION.filter((value) => value !== '10') : PIXVERSE_DURATION.filter((value) => value === PIXVERSE_DURATION[0]))
    : (long ? PIXVERSE_DURATION : PIXVERSE_DURATION.filter((value) => value !== '10'))
  const picked = nearestDuration(seconds, allowed)
  logPayloadClamp('duration', seconds, picked, PIXVERSE_V56_TEXT)
  return picked
}

function snap(value: string | undefined, allowed: readonly string[], fallback: string): string {
  if (value && allowed.includes(value)) return value
  return fallback
}

function pixversePrompt(prompt: string, camera?: PromptCamera | null): string {
  const line = cameraSentence(camera)?.trim() ?? ''
  const scene = prompt.trim()
  const cameraLine = line && !scene.includes('Camera:') ? line : ''
  return capUtf8Bytes([scene, cameraLine].filter(Boolean).join(' '), PIXVERSE_PROMPT_BYTES)
}

export type PixversePayloadKind =
  | 'v56_text'
  | 'v56_image'
  | 'v56_transition'
  | 'v55_text'
  | 'v55_image'
  | 'v45_text'
  | 'v4_image'

export function buildPixversePayload(args: {
  kind: PixversePayloadKind
  prompt: string
  durationSec?: number
  aspectRatio?: string
  resolution?: string
  imageUrl?: string
  endImageUrl?: string
  negativePrompt?: string
  seed?: number
  camera?: PromptCamera | null
}): Record<string, unknown> {
  const prompt = pixversePrompt(args.prompt, args.camera)
  if (prompt.length < 1) throw new PayloadError('pixverse shot has no prompt')
  const long = args.kind.startsWith('v56') || args.kind.startsWith('v55')
  const resolution = snap(args.resolution, PIXVERSE_RESOLUTION, '720p')
  const duration = pixverseDuration(args.durationSec, resolution, long)
  const modern = args.kind.startsWith('v56') || args.kind.startsWith('v55')
  const payload: Record<string, unknown> = { prompt, duration, resolution }
  if (modern) {
    payload.generate_audio_switch = false
    payload.thinking_type = 'disabled'
  }
  const negative = args.negativePrompt?.trim()
    ? capUtf8Bytes(args.negativePrompt.trim(), PIXVERSE_PROMPT_BYTES)
    : ''
  if (negative) payload.negative_prompt = negative
  const seed = args.seed != null && Number.isFinite(args.seed) && args.seed >= 0 && args.seed <= 2147483647
    ? Math.round(args.seed)
    : undefined
  if (seed != null) payload.seed = seed
  const withAspect = args.kind === 'v56_text' || args.kind === 'v55_text' || args.kind === 'v45_text' || args.kind === 'v56_transition'
  if (withAspect) payload.aspect_ratio = snap(args.aspectRatio, PIXVERSE_ASPECT, '16:9')
  if (args.kind === 'v56_image' || args.kind === 'v55_image' || args.kind === 'v4_image') {
    const imageUrl = args.imageUrl?.trim()
    if (!imageUrl) throw new PayloadError('pixverse image-to-video requires image_url')
    payload.image_url = imageUrl
    return payload
  }
  if (args.kind === 'v56_transition') {
    const first = args.imageUrl?.trim()
    const end = args.endImageUrl?.trim()
    if (!first || !end) throw new PayloadError('pixverse transition requires first_image_url and end_image_url')
    payload.first_image_url = first
    payload.end_image_url = end
  }
  return payload
}
