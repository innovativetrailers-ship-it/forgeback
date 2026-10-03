import type { FamilyFieldMap, Mode } from '../types/provider'
import { PayloadError } from './payload'
import { cameraSentence, capPromptText, type PromptCamera } from './identity'
import type { ModeModel } from './modePipeline'

/**
 * Veo 3.1 field map from OpenAPI on 2026-09-24.
 * fal-ai/veo3.1 — 200. This is text. fal-ai/veo3.1/text-to-video — 404.
 * fal-ai/veo3.1/image-to-video — 200. Required prompt + image_url.
 * fal-ai/veo3.1/reference-to-video — 200. Required prompt + image_urls.
 *   Duration is const "8s". No seed. No negative_prompt. No @ tags.
 * fal-ai/veo3.1/first-last-frame-to-video — 200.
 *   Required first_frame_url + last_frame_url. Not image_url / end_image_url.
 * fal-ai/veo3.1/extend-video — 200. Required prompt + video_url.
 *   Duration is const "7s". Resolution is const "720p".
 * Prompt maxLength is 20000. Duration elsewhere is "4s" | "6s" | "8s".
 * generate_audio exists and stays false on submit.
 * auto_fix rewrites the prompt, so it is not sent.
 * Lite base and lite image, reference, and first-last returned 200.
 * Lite text-to-video and lite extend returned 404. Lite is not the pool model.
 */

export const VEO_TEXT = 'fal-ai/veo3.1'
export const VEO_IMAGE = 'fal-ai/veo3.1/image-to-video'
export const VEO_REFERENCE = 'fal-ai/veo3.1/reference-to-video'
export const VEO_FIRST_LAST = 'fal-ai/veo3.1/first-last-frame-to-video'
export const VEO_EXTEND = 'fal-ai/veo3.1/extend-video'

export const VEO_LITE_VERIFIED = {
  text: 'fal-ai/veo3.1/lite',
  first_frame: 'fal-ai/veo3.1/lite/image-to-video',
  reference: 'fal-ai/veo3.1/lite/reference-to-video',
  first_last: 'fal-ai/veo3.1/lite/first-last-frame-to-video',
} as const

export const VEO_ENDPOINTS: Partial<Record<Mode, string>> = {
  text: VEO_TEXT,
  first_frame: VEO_IMAGE,
  first_last: VEO_FIRST_LAST,
  reference: VEO_REFERENCE,
  video_edit: VEO_EXTEND,
}

export const VEO_DURATION = ['4s', '6s', '8s'] as const
export const VEO_RESOLUTION = ['720p', '1080p', '4k'] as const
export const VEO_PROMPT_MAX = 20000
export const VEO_REFERENCE_CAP = 3

export const VEO_FIELDS: FamilyFieldMap = {
  firstFrame: 'image_url',
  firstFrameForLast: 'first_frame_url',
  lastFrame: 'last_frame_url',
  references: { mode: 'field', field: 'image_urls', max: VEO_REFERENCE_CAP },
  duration: { field: 'duration', kind: 'string_s', values: [...VEO_DURATION] },
  audio: { field: 'generate_audio', kind: 'bool' },
  resolution: { field: 'resolution', values: [...VEO_RESOLUTION] },
  aspect: { field: 'aspect_ratio', values: ['auto', '16:9', '9:16'] },
  negative: 'negative_prompt',
  seed: 'seed',
}

export function veoModeModel(): ModeModel {
  return {
    id: 'veo-3.1',
    provider: 'fal',
    endpoints: VEO_ENDPOINTS,
    fields: VEO_FIELDS,
    limits: { maxPromptChars: VEO_PROMPT_MAX },
    nativeAudio: true,
  }
}

export function veoDuration(seconds: number | undefined): (typeof VEO_DURATION)[number] {
  const options = [4, 6, 8]
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return '8s'
  let best = 8
  let distance = Infinity
  for (const value of options) {
    const gap = Math.abs(value - seconds)
    if (gap < distance || (gap === distance && value > best)) {
      distance = gap
      best = value
    }
  }
  return `${best}s` as (typeof VEO_DURATION)[number]
}

function snap(value: string | undefined, allowed: readonly string[], fallback: string): string {
  if (value && allowed.includes(value)) return value
  return fallback
}

function veoPrompt(prompt: string, camera?: PromptCamera | null): string {
  const line = cameraSentence(camera)?.trim() ?? ''
  const text = [prompt.trim(), line].filter(Boolean).join(' ')
  return capPromptText(text, VEO_PROMPT_MAX)
}

export function buildVeoPayload(args: {
  mode: 'text' | 'first_frame' | 'first_last' | 'reference' | 'video_edit'
  prompt: string
  durationSec?: number
  aspectRatio?: string
  resolution?: string
  negativePrompt?: string
  imageUrl?: string
  endImageUrl?: string
  videoUrl?: string
  imageUrls?: string[]
  seed?: number
  camera?: PromptCamera | null
}): Record<string, unknown> {
  const prompt = veoPrompt(args.prompt, args.camera)
  if (prompt.length < 3) throw new PayloadError('veo shot has no prompt')
  const resolution = snap(args.resolution, VEO_RESOLUTION, '720p')
  if (args.mode === 'video_edit') {
    const videoUrl = args.videoUrl?.trim()
    if (!videoUrl) throw new PayloadError('veo extend requires video_url')
    const payload: Record<string, unknown> = {
      prompt,
      video_url: videoUrl,
      duration: '7s',
      resolution: '720p',
      aspect_ratio: snap(args.aspectRatio, ['auto', '16:9', '9:16'], 'auto'),
      generate_audio: false,
    }
    const negative = args.negativePrompt?.trim()
    if (negative) payload.negative_prompt = capPromptText(negative, VEO_PROMPT_MAX)
    if (args.seed != null) payload.seed = args.seed
    return payload
  }
  if (args.mode === 'reference') {
    const imageUrls = (args.imageUrls ?? []).map((url) => url.trim()).filter(Boolean).slice(0, VEO_REFERENCE_CAP)
    if (!imageUrls.length) throw new PayloadError('veo reference-to-video requires image_urls')
    return {
      prompt,
      image_urls: imageUrls,
      duration: '8s',
      resolution,
      aspect_ratio: snap(args.aspectRatio, ['16:9', '9:16'], '16:9'),
      generate_audio: false,
    }
  }
  const duration = veoDuration(args.durationSec)
  if (args.mode === 'text') {
    const payload: Record<string, unknown> = {
      prompt,
      duration,
      resolution,
      aspect_ratio: snap(args.aspectRatio, ['16:9', '9:16'], '16:9'),
      generate_audio: false,
    }
    const negative = args.negativePrompt?.trim()
    if (negative) payload.negative_prompt = capPromptText(negative, VEO_PROMPT_MAX)
    if (args.seed != null) payload.seed = args.seed
    return payload
  }
  if (args.mode === 'first_last') {
    const first = args.imageUrl?.trim()
    const last = args.endImageUrl?.trim()
    if (!first || !last) throw new PayloadError('veo first/last requires first_frame_url and last_frame_url')
    const payload: Record<string, unknown> = {
      prompt,
      first_frame_url: first,
      last_frame_url: last,
      duration,
      resolution,
      aspect_ratio: snap(args.aspectRatio, ['auto', '16:9', '9:16'], 'auto'),
      generate_audio: false,
    }
    const negative = args.negativePrompt?.trim()
    if (negative) payload.negative_prompt = capPromptText(negative, VEO_PROMPT_MAX)
    if (args.seed != null) payload.seed = args.seed
    return payload
  }
  const imageUrl = args.imageUrl?.trim()
  if (!imageUrl) throw new PayloadError('veo image-to-video requires image_url')
  const payload: Record<string, unknown> = {
    prompt,
    image_url: imageUrl,
    duration,
    resolution,
    aspect_ratio: snap(args.aspectRatio, ['auto', '16:9', '9:16'], 'auto'),
    generate_audio: false,
  }
  const negative = args.negativePrompt?.trim()
  if (negative) payload.negative_prompt = capPromptText(negative, VEO_PROMPT_MAX)
  if (args.seed != null) payload.seed = args.seed
  return payload
}
