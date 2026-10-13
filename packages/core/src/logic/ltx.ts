import type { FamilyFieldMap, Mode } from '../types/provider'
import { clampDuration, logPayloadClamp, PayloadError, type DurationConstraint, type PayloadBuildOptions } from './payload'
import { cameraSentence, capPromptText, type PromptCamera } from './identity'
import type { ModeModel } from './modePipeline'

/**
 * LTX 2.3 field map from OpenAPI on 2026-09-25.
 * fal-ai/ltx-2.3/text-to-video and image-to-video — 200.
 * fal-ai/ltx-2.3/text-to-video/fast and image-to-video/fast — 200.
 * The draft registry id stays ltx-2.3-fast. Its text endpoint is the fast one.
 * Its image endpoint stays fal-ai/ltx-2.3/image-to-video. Fast image is verified and sealed.
 * fal-ai/ltx-2.3/audio-to-video — 200 and requires audio_url. Normal shots are not routed to it.
 * multi-keyframe, reference-to-video, and ltx-2.5 text and image — 404.
 * Duration is an integer enum. Full model: 6|8|10. Fast model: 6 through 20 in steps of 2.
 * Fast durations above 10 require 25 fps and 1080p.
 * Resolution is 1080p|1440p|2160p. There is no 720p.
 * Text aspect is 16:9|9:16. Image aspect also allows auto. Last frame is end_image_url on image-to-video.
 * Prompt maxLength is 5000. No seed. No reference field.
 * generate_audio defaults true. Submit sends false.
 */

export const LTX_TEXT = 'fal-ai/ltx-2.3/text-to-video'
export const LTX_IMAGE = 'fal-ai/ltx-2.3/image-to-video'
export const LTX_FAST_TEXT = 'fal-ai/ltx-2.3/text-to-video/fast'
export const LTX_FAST_IMAGE = 'fal-ai/ltx-2.3/image-to-video/fast'
export const LTX_AUDIO = 'fal-ai/ltx-2.3/audio-to-video'

export const LTX_ENDPOINTS: Partial<Record<Mode, string>> = {
  text: LTX_FAST_TEXT,
  first_frame: LTX_IMAGE,
  first_last: LTX_IMAGE,
}

export const LTX_DURATION = [6, 8, 10] as const
export const LTX_FAST_DURATION = [6, 8, 10, 12, 14, 16, 18, 20] as const
export const LTX_RESOLUTION = ['1080p', '1440p', '2160p'] as const
export const LTX_ASPECT = ['16:9', '9:16'] as const
export const LTX_IMAGE_ASPECT = ['auto', '16:9', '9:16'] as const
export const LTX_PROMPT_MAX = 5000

export const LTX_FIELDS: FamilyFieldMap = {
  firstFrame: 'image_url',
  lastFrame: 'end_image_url',
  references: { mode: 'field', max: 0 },
  duration: { field: 'duration', kind: 'enum', values: [...LTX_FAST_DURATION] },
  audio: { field: 'generate_audio', kind: 'bool' },
  resolution: { field: 'resolution', values: [...LTX_RESOLUTION] },
  aspect: { field: 'aspect_ratio', values: [...LTX_ASPECT] },
}

export function ltxModeModel(): ModeModel {
  return {
    id: 'ltx-2.3-fast',
    provider: 'fal',
    endpoints: LTX_ENDPOINTS,
    fields: LTX_FIELDS,
    limits: { maxPromptChars: LTX_PROMPT_MAX },
    nativeAudio: false,
  }
}

export function ltxDurationConstraint(fast: boolean): DurationConstraint {
  return { shape: 'set', values: fast ? LTX_FAST_DURATION : LTX_DURATION, fallback: 6 }
}

export function ltxDuration(
  seconds: number | undefined,
  fast: boolean,
  onClamp: PayloadBuildOptions['onClamp'] = logPayloadClamp,
  endpoint?: string,
): number {
  return Number(clampDuration(seconds, ltxDurationConstraint(fast), endpoint ?? (fast ? LTX_FAST_TEXT : LTX_TEXT), onClamp))
}

function snap(value: string | undefined, allowed: readonly string[], fallback: string): string {
  if (value && allowed.includes(value)) return value
  return fallback
}

function ltxPrompt(prompt: string, camera?: PromptCamera | null): string {
  const line = cameraSentence(camera)?.trim() ?? ''
  const scene = prompt.trim()
  const cameraLine = line && !scene.includes('Camera:') ? line : ''
  return capPromptText([scene, cameraLine].filter(Boolean).join(' '), LTX_PROMPT_MAX)
}

export type LtxPayloadKind = 'fast_text' | 'text' | 'fast_image' | 'image'

export function buildLtxPayload(args: {
  kind: LtxPayloadKind
  prompt: string
  durationSec?: number
  aspectRatio?: string
  resolution?: string
  imageUrl?: string
  endImageUrl?: string
  camera?: PromptCamera | null
}): Record<string, unknown> {
  const prompt = ltxPrompt(args.prompt, args.camera)
  if (prompt.length < 1) throw new PayloadError('ltx shot has no prompt')
  const fast = args.kind.startsWith('fast_')
  const duration = ltxDuration(args.durationSec, fast)
  const long = fast && duration > 10
  const resolution = long ? '1080p' : snap(args.resolution, LTX_RESOLUTION, '1080p')
  const payload: Record<string, unknown> = {
    prompt,
    duration,
    resolution,
    generate_audio: false,
  }
  if (long) payload.fps = 25
  const image = args.kind === 'fast_image' || args.kind === 'image'
  if (!image) {
    payload.aspect_ratio = snap(args.aspectRatio, LTX_ASPECT, '16:9')
    return payload
  }
  const imageUrl = args.imageUrl?.trim()
  if (!imageUrl) throw new PayloadError('ltx image-to-video requires image_url')
  payload.image_url = imageUrl
  payload.aspect_ratio = snap(args.aspectRatio, LTX_IMAGE_ASPECT, 'auto')
  const endImageUrl = args.endImageUrl?.trim()
  if (endImageUrl) payload.end_image_url = endImageUrl
  return payload
}
