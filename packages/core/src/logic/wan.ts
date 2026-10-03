import type { FamilyFieldMap, Mode } from '../types/provider'
import { clampDuration, logPayloadClamp, PayloadError, type DurationConstraint, type PayloadBuildOptions } from './payload'
import { cameraSentence, capPromptText, type PromptCamera } from './identity'
import type { ModeModel } from './modePipeline'

/**
 * Wan 2.7 field map from OpenAPI on 2026-09-24.
 * fal-ai/wan/v2.7/text-to-video, image-to-video, and reference-to-video — 200.
 * Every guessed Wan 2.6 id (fal-ai/wan-2.6/... and fal-ai/wan/v2.6/...) — 404.
 * 2.7 is the pool model. 2.6 is not registered.
 * Duration is an integer enum (2-15, reference 2-10). Not num_frames. Not "5s".
 * Prompt text says max 5000 characters. The property has no maxLength.
 * Negative prompt text says max 500 characters.
 * Reference files are reference_image_urls and reference_video_urls. No # tags.
 * The schema declares no maxItems; the live control cap stays 4.
 * image-to-video has no aspect_ratio. end_image_url is the last frame on that same endpoint.
 * There is no generate_audio field. audio_url is an optional file. Text-to-video
 * says that omitting it lets the model write background music. There is no off switch.
 * enable_prompt_expansion defaults true and rewrites the prompt, so submit sends false
 * on text and image-to-video. Reference has no such field.
 * fal-ai/wan/v2.7/edit — 200, but it is an image edit (image_urls, num_images), not video.
 * It is not the video_edit mode. wan/v2.7/edit without the fal-ai prefix — 404.
 * Older i2v ids (2.5 preview, 2.2-5b, 2.2-a14b, wan-pro, wan-i2v) returned 200
 * and are not pool models.
 */

export const WAN_TEXT = 'fal-ai/wan/v2.7/text-to-video'
export const WAN_IMAGE = 'fal-ai/wan/v2.7/image-to-video'
export const WAN_REFERENCE = 'fal-ai/wan/v2.7/reference-to-video'

export const WAN_ENDPOINTS: Partial<Record<Mode, string>> = {
  text: WAN_TEXT,
  first_frame: WAN_IMAGE,
  first_last: WAN_IMAGE,
  reference: WAN_REFERENCE,
}

export const WAN_DURATION = [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const
export const WAN_REFERENCE_DURATION = [2, 3, 4, 5, 6, 7, 8, 9, 10] as const
export const WAN_RESOLUTION = ['720p', '1080p'] as const
export const WAN_ASPECT = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const
export const WAN_PROMPT_MAX = 5000
export const WAN_NEGATIVE_MAX = 500
export const WAN_REFERENCE_CAP = 4

export const WAN_FIELDS: FamilyFieldMap = {
  firstFrame: 'image_url',
  lastFrame: 'end_image_url',
  references: { mode: 'field', field: 'reference_image_urls', max: WAN_REFERENCE_CAP },
  duration: { field: 'duration', kind: 'enum', values: [...WAN_DURATION] },
  audio: { field: 'audio_url', kind: 'native_always' },
  resolution: { field: 'resolution', values: [...WAN_RESOLUTION] },
  aspect: { field: 'aspect_ratio', values: [...WAN_ASPECT] },
  negative: 'negative_prompt',
  seed: 'seed',
}

export function wanModeModel(): ModeModel {
  return {
    id: 'wan-2.7',
    provider: 'fal',
    endpoints: WAN_ENDPOINTS,
    fields: WAN_FIELDS,
    limits: { maxPromptChars: WAN_PROMPT_MAX },
    nativeAudio: false,
  }
}

export function wanDurationConstraint(reference = false): DurationConstraint {
  return { shape: 'set', values: reference ? WAN_REFERENCE_DURATION : WAN_DURATION, fallback: 5 }
}

export function wanDuration(
  seconds: number | undefined,
  reference = false,
  onClamp: PayloadBuildOptions['onClamp'] = logPayloadClamp,
): number {
  return Number(clampDuration(seconds, wanDurationConstraint(reference), reference ? WAN_REFERENCE : WAN_TEXT, onClamp))
}

function snap(value: string | undefined, allowed: readonly string[], fallback: string): string {
  if (value && allowed.includes(value)) return value
  return fallback
}

function wanPrompt(prompt: string, camera?: PromptCamera | null): string {
  const line = cameraSentence(camera)?.trim() ?? ''
  return capPromptText([prompt.trim(), line].filter(Boolean).join(' '), WAN_PROMPT_MAX)
}

export function buildWanPayload(args: {
  mode: 'text' | 'first_frame' | 'first_last' | 'reference'
  prompt: string
  durationSec?: number
  aspectRatio?: string
  resolution?: string
  negativePrompt?: string
  imageUrl?: string
  endImageUrl?: string
  imageUrls?: string[]
  videoUrls?: string[]
  seed?: number
  camera?: PromptCamera | null
}): Record<string, unknown> {
  const prompt = wanPrompt(args.prompt, args.camera)
  if (prompt.length < 3) throw new PayloadError('wan shot has no prompt')
  const resolution = snap(args.resolution, WAN_RESOLUTION, '720p')
  const negative = args.negativePrompt?.trim()
    ? capPromptText(args.negativePrompt.trim(), WAN_NEGATIVE_MAX)
    : undefined
  const seed = args.seed != null && Number.isFinite(args.seed) && args.seed >= 0 && args.seed <= 2147483647
    ? Math.round(args.seed)
    : undefined
  if (args.mode === 'reference') {
    const imageUrls = (args.imageUrls ?? []).map((url) => url.trim()).filter(Boolean).slice(0, WAN_REFERENCE_CAP)
    const videoUrls = (args.videoUrls ?? []).map((url) => url.trim()).filter(Boolean).slice(0, WAN_REFERENCE_CAP)
    if (!imageUrls.length && !videoUrls.length) {
      throw new PayloadError('wan reference-to-video requires a reference image or video')
    }
    const payload: Record<string, unknown> = {
      prompt,
      duration: wanDuration(args.durationSec, true),
      resolution,
      aspect_ratio: snap(args.aspectRatio, WAN_ASPECT, '16:9'),
    }
    if (imageUrls.length) payload.reference_image_urls = imageUrls
    if (videoUrls.length) payload.reference_video_urls = videoUrls
    if (negative) payload.negative_prompt = negative
    if (seed != null) payload.seed = seed
    return payload
  }
  const duration = wanDuration(args.durationSec, false)
  if (args.mode === 'text') {
    const payload: Record<string, unknown> = {
      prompt,
      duration,
      resolution,
      aspect_ratio: snap(args.aspectRatio, WAN_ASPECT, '16:9'),
      enable_prompt_expansion: false,
    }
    if (negative) payload.negative_prompt = negative
    if (seed != null) payload.seed = seed
    return payload
  }
  const imageUrl = args.imageUrl?.trim()
  if (!imageUrl) throw new PayloadError('wan image-to-video requires image_url')
  const payload: Record<string, unknown> = {
    prompt,
    image_url: imageUrl,
    duration,
    resolution,
    enable_prompt_expansion: false,
  }
  if (args.mode === 'first_last') {
    const endImageUrl = args.endImageUrl?.trim()
    if (!endImageUrl) throw new PayloadError('wan first/last requires end_image_url')
    payload.end_image_url = endImageUrl
  }
  if (negative) payload.negative_prompt = negative
  if (seed != null) payload.seed = seed
  return payload
}
