import type { FamilyFieldMap, Mode } from '../types/provider'
import { PayloadError } from './payload'
import { cameraSentence, capPromptText, type PromptCamera } from './identity'
import type { ModeModel } from './modePipeline'

/**
 * Wan 3.0 field map from OpenAPI on 2026-09-24.
 * alibaba/wan-3.0/text-to-video, image-to-video, and reference-to-video — 200.
 * fal-ai/wan-3.0/text-to-video, fal-ai/wan/v3/text-to-video, and fal-ai/wan/v3.0/text-to-video — 404.
 * Prime text, image, and reference also returned 200. Prime is not this registry id.
 * Edit, extend, and text-to-image ids that were probed returned 404.
 * Wan 2.6 text ids returned 404 again. Wan 2.7 stays the pool model.
 * First frame is start_image_url. Last frame is end_image_url on the same image endpoint.
 * Reference files are reference_image_urls (max 10) and reference_video_urls (max 5).
 * There is no reference_media field and no # tag.
 * Reference videos are described as totaling at most 15 seconds. Duration is an integer 2-30.
 * Prompt maxLength is 20000. Reference prompt is optional.
 * audio defaults true and only controls whether the track is returned. Submit sends false.
 * enable_prompt_expansion defaults true and rewrites the prompt, so submit sends false.
 * enable_thinking stays omitted. enable_safety_checker stays omitted.
 * Reference mode and first/last frames are separate endpoints, so a payload never sends both.
 */

export const WAN30_TEXT = 'alibaba/wan-3.0/text-to-video'
export const WAN30_IMAGE = 'alibaba/wan-3.0/image-to-video'
export const WAN30_REFERENCE = 'alibaba/wan-3.0/reference-to-video'
export const WAN30_PRIME_TEXT = 'alibaba/wan-3.0-prime/text-to-video'
export const WAN30_PRIME_IMAGE = 'alibaba/wan-3.0-prime/image-to-video'
export const WAN30_PRIME_REFERENCE = 'alibaba/wan-3.0-prime/reference-to-video'

export const WAN30_ENDPOINTS: Partial<Record<Mode, string>> = {
  text: WAN30_TEXT,
  first_frame: WAN30_IMAGE,
  first_last: WAN30_IMAGE,
  reference: WAN30_REFERENCE,
}

export const WAN30_RESOLUTION = ['480p', '720p', '1080p'] as const
export const WAN30_ASPECT = ['adaptive', '16:9', '4:3', '1:1', '3:4', '9:16'] as const
export const WAN30_PROMPT_MAX = 20000
export const WAN30_IMAGE_CAP = 10
export const WAN30_VIDEO_CAP = 5
export const WAN30_DURATION_MIN = 2
export const WAN30_DURATION_MAX = 30

export const WAN30_FIELDS: FamilyFieldMap = {
  firstFrame: 'start_image_url',
  lastFrame: 'end_image_url',
  references: { mode: 'field', field: 'reference_image_urls', max: WAN30_IMAGE_CAP },
  duration: { field: 'duration', kind: 'number', min: WAN30_DURATION_MIN, max: WAN30_DURATION_MAX },
  audio: { field: 'audio', kind: 'bool' },
  resolution: { field: 'resolution', values: [...WAN30_RESOLUTION] },
  aspect: { field: 'aspect_ratio', values: [...WAN30_ASPECT] },
  seed: 'seed',
}

export function wan30ModeModel(): ModeModel {
  return {
    id: 'wan-3.0',
    provider: 'fal',
    endpoints: WAN30_ENDPOINTS,
    fields: WAN30_FIELDS,
    limits: { maxPromptChars: WAN30_PROMPT_MAX },
    nativeAudio: false,
  }
}

export function wan30Duration(seconds: number | undefined): number {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return 5
  return Math.min(WAN30_DURATION_MAX, Math.max(WAN30_DURATION_MIN, Math.round(seconds)))
}

function snap(value: string | undefined, allowed: readonly string[], fallback: string): string {
  if (value && allowed.includes(value)) return value
  return fallback
}

function wan30Prompt(prompt: string, camera?: PromptCamera | null): string {
  const line = cameraSentence(camera)?.trim() ?? ''
  return capPromptText([prompt.trim(), line].filter(Boolean).join(' '), WAN30_PROMPT_MAX)
}

export function buildWan30Payload(args: {
  mode: 'text' | 'first_frame' | 'first_last' | 'reference'
  prompt: string
  durationSec?: number
  aspectRatio?: string
  resolution?: string
  imageUrl?: string
  endImageUrl?: string
  imageUrls?: string[]
  videoUrls?: string[]
  seed?: number
  camera?: PromptCamera | null
}): Record<string, unknown> {
  const prompt = wan30Prompt(args.prompt, args.camera)
  const duration = wan30Duration(args.durationSec)
  const resolution = snap(args.resolution, WAN30_RESOLUTION, '1080p')
  const aspectRatio = snap(args.aspectRatio, WAN30_ASPECT, 'adaptive')
  const seed = args.seed != null && Number.isFinite(args.seed) && args.seed >= 0 && args.seed <= 2147483647
    ? Math.round(args.seed)
    : undefined
  const shared: Record<string, unknown> = {
    duration,
    resolution,
    aspect_ratio: aspectRatio,
    audio: false,
    enable_prompt_expansion: false,
  }
  if (seed != null) shared.seed = seed
  if (args.mode === 'reference') {
    const imageUrls = (args.imageUrls ?? []).map((url) => url.trim()).filter(Boolean).slice(0, WAN30_IMAGE_CAP)
    const videoUrls = (args.videoUrls ?? []).map((url) => url.trim()).filter(Boolean).slice(0, WAN30_VIDEO_CAP)
    if (!imageUrls.length && !videoUrls.length) {
      throw new PayloadError('wan 3.0 reference-to-video requires a reference image or video')
    }
    const payload: Record<string, unknown> = { ...shared }
    if (prompt.length >= 1) payload.prompt = prompt
    if (imageUrls.length) payload.reference_image_urls = imageUrls
    if (videoUrls.length) payload.reference_video_urls = videoUrls
    return payload
  }
  if (prompt.length < 1 && args.mode === 'text') throw new PayloadError('wan 3.0 text-to-video requires a prompt')
  if (args.mode === 'text') return { prompt, ...shared }
  const imageUrl = args.imageUrl?.trim()
  if (!imageUrl) throw new PayloadError('wan 3.0 image-to-video requires start_image_url')
  const payload: Record<string, unknown> = { ...shared, start_image_url: imageUrl }
  if (prompt.length >= 1) payload.prompt = prompt
  if (args.mode === 'first_last') {
    const endImageUrl = args.endImageUrl?.trim()
    if (!endImageUrl) throw new PayloadError('wan 3.0 first/last requires end_image_url')
    payload.end_image_url = endImageUrl
  }
  return payload
}
