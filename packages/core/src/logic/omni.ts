import type { FamilyFieldMap, Mode } from '../types/provider'
import { PayloadError } from './payload'
import { cameraSentence, capPromptText, type PromptCamera } from './identity'
import type { ModeModel } from './modePipeline'

/**
 * Gemini Omni Flash 1.1 field map from OpenAPI on 2026-09-25.
 * google/gemini-omni-flash/v1.1/text-to-video — 200. Required prompt.
 * google/gemini-omni-flash/v1.1/image-to-video — 200. Required prompt + image_url.
 *   Optional end_image_url on the same endpoint is first-last. Not start_image_url.
 * google/gemini-omni-flash/v1.1/reference-to-video — 200. Required prompt.
 *   image_urls maxItems 10. reference_video_urls maxItems 3, each described as ≤3s.
 *   Example tags are <IMAGE_REF_0> and <VIDEO_REF_0>.
 * google/gemini-omni-flash/v1.1/edit — 200. Required prompt + video_url.
 *   Optional resolution. No duration. No aspect_ratio.
 * google/gemini-omni-flash/v1.1 (unified) — 404.
 * google/gemini-omni-flash-1.1-video-edit — 404.
 * fal-ai/gemini-omni-flash/* — 404.
 * Unversioned google/gemini-omni-flash text, image, reference, and edit returned 200
 * with a thinner schema (no 4k / end_image_url / reference videos). Not this id.
 * Omni Audio and Omni Character trainer/inference guesses all 404. They are not wired.
 * Duration is an integer 3-10, default 8. Prompt maxLength is 20000.
 * Resolution is 360p|720p|1080p|4k, default 720p. Aspect is 16:9|9:16.
 * No generate_audio field, no seed, no voice_id, no character ids.
 * Native synced audio stays on because it cannot be switched off.
 * llms.txt bills every mode $0.03/s 360p, $0.10/s 720p, $0.15/s 1080p, $0.30/s 4k.
 * This is the primary quality t2v. Veo 3.1 stays in the pool for 4K and long takes.
 */

export const OMNI_TEXT = 'google/gemini-omni-flash/v1.1/text-to-video'
export const OMNI_IMAGE = 'google/gemini-omni-flash/v1.1/image-to-video'
export const OMNI_REFERENCE = 'google/gemini-omni-flash/v1.1/reference-to-video'
export const OMNI_EDIT = 'google/gemini-omni-flash/v1.1/edit'
export const OMNI_BASE_TEXT = 'google/gemini-omni-flash/text-to-video'
export const OMNI_BASE_IMAGE = 'google/gemini-omni-flash/image-to-video'
export const OMNI_BASE_REFERENCE = 'google/gemini-omni-flash/reference-to-video'
export const OMNI_BASE_EDIT = 'google/gemini-omni-flash/edit'

export const OMNI_ENDPOINTS: Partial<Record<Mode, string>> = {
  text: OMNI_TEXT,
  first_frame: OMNI_IMAGE,
  first_last: OMNI_IMAGE,
  reference: OMNI_REFERENCE,
  video_edit: OMNI_EDIT,
}

export const OMNI_RESOLUTION = ['360p', '720p', '1080p', '4k'] as const
export const OMNI_ASPECT = ['16:9', '9:16'] as const
export const OMNI_PROMPT_MAX = 20000
export const OMNI_IMAGE_CAP = 10
export const OMNI_VIDEO_CAP = 3
export const OMNI_DURATION_MIN = 3
export const OMNI_DURATION_MAX = 10
export const OMNI_DURATION_DEFAULT = 8

/** Guessed Omni Audio / Character / unified ids. OpenAPI 404 on 2026-09-25. Do not submit. */
export const OMNI_UNVERIFIED_IDS = [
  'google/gemini-omni-flash/v1.1',
  'google/gemini-omni-flash-1.1-video-edit',
  'fal-ai/gemini-omni-flash/text-to-video',
  'fal-ai/gemini-omni-flash/image-to-video',
  'fal-ai/gemini-omni-flash/reference-to-video',
  'fal-ai/gemini-omni-flash/edit',
  'google/gemini-omni-audio',
  'google/gemini-omni-character',
  'google/gemini-omni-flash/v1.1/audio',
  'google/gemini-omni-flash/v1.1/character',
  'google/gemini-omni-flash/audio',
  'google/gemini-omni-flash/character',
] as const

export const OMNI_FIELDS: FamilyFieldMap = {
  firstFrame: 'image_url',
  lastFrame: 'end_image_url',
  references: { mode: 'field', field: 'image_urls', max: OMNI_IMAGE_CAP },
  duration: { field: 'duration', kind: 'number', min: OMNI_DURATION_MIN, max: OMNI_DURATION_MAX },
  audio: { field: '', kind: 'native_always' },
  resolution: { field: 'resolution', values: [...OMNI_RESOLUTION] },
  aspect: { field: 'aspect_ratio', values: [...OMNI_ASPECT] },
}

export function omniModeModel(): ModeModel {
  return {
    id: 'gemini-omni',
    provider: 'fal',
    endpoints: OMNI_ENDPOINTS,
    fields: OMNI_FIELDS,
    limits: { maxPromptChars: OMNI_PROMPT_MAX },
    nativeAudio: true,
  }
}

export function omniDuration(seconds: number | undefined): number {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return OMNI_DURATION_DEFAULT
  return Math.min(OMNI_DURATION_MAX, Math.max(OMNI_DURATION_MIN, Math.round(seconds)))
}

function snap(value: string | undefined, allowed: readonly string[], fallback: string): string {
  if (value && (allowed as readonly string[]).includes(value)) return value
  return fallback
}

function omniPrompt(prompt: string, camera?: PromptCamera | null, prefix?: string): string {
  const line = cameraSentence(camera)?.trim() ?? ''
  const scene = prompt.trim()
  const cameraLine = line && !scene.includes('Camera:') ? line : ''
  const head = prefix && !scene.includes('<IMAGE_REF_0>') && !scene.includes('<VIDEO_REF_0>')
    ? prefix
    : ''
  return capPromptText([head, scene, cameraLine].filter(Boolean).join(' '), OMNI_PROMPT_MAX)
}

function imageRefPrefix(labels: string[]): string {
  return labels.map((label, index) => {
    const tag = `<IMAGE_REF_${index}>`
    return label.trim() ? `${tag} is ${label.trim()}` : tag
  }).join('. ')
}

function videoRefPrefix(count: number): string {
  return Array.from({ length: count }, (_, index) => `<VIDEO_REF_${index}>`).join(' ')
}

function uniqueUrls(urls: string[] | undefined, cap: number): string[] {
  const out: string[] = []
  for (const url of urls ?? []) {
    const clean = url.trim()
    if (!clean || out.includes(clean) || out.length >= cap) continue
    out.push(clean)
  }
  return out
}

export type OmniPayloadMode = 'text' | 'first_frame' | 'first_last' | 'reference' | 'video_edit'

export function buildOmniPayload(args: {
  mode: OmniPayloadMode
  prompt: string
  durationSec?: number
  aspectRatio?: string
  resolution?: string
  imageUrl?: string
  endImageUrl?: string
  imageUrls?: string[]
  names?: string[]
  videoUrls?: string[]
  videoUrl?: string
  camera?: PromptCamera | null
}): Record<string, unknown> {
  const resolution = snap(args.resolution, OMNI_RESOLUTION, '720p')
  const aspectRatio = snap(args.aspectRatio, OMNI_ASPECT, '16:9')

  if (args.mode === 'video_edit') {
    const videoUrl = args.videoUrl?.trim()
    if (!videoUrl) throw new PayloadError('omni video-edit requires video_url')
    const prompt = omniPrompt(args.prompt, args.camera)
    if (prompt.length < 1) throw new PayloadError('omni video-edit requires a prompt')
    return { prompt, video_url: videoUrl, resolution }
  }

  if (args.mode === 'reference') {
    const imageUrls = uniqueUrls(args.imageUrls, OMNI_IMAGE_CAP)
    const videoUrls = uniqueUrls(args.videoUrls, OMNI_VIDEO_CAP)
    if (!imageUrls.length && !videoUrls.length) {
      throw new PayloadError('omni reference-to-video requires image_urls or reference_video_urls')
    }
    const named = args.names ?? []
    const labels = imageUrls.map((_, index) => named[index]?.trim() ?? '')
    const prefix = [imageRefPrefix(labels), videoRefPrefix(videoUrls.length)].filter(Boolean).join(' ')
    const prompt = omniPrompt(args.prompt, args.camera, prefix)
    if (prompt.length < 1) throw new PayloadError('omni reference-to-video requires a prompt')
    const payload: Record<string, unknown> = {
      prompt,
      duration: omniDuration(args.durationSec),
      resolution,
      aspect_ratio: aspectRatio,
    }
    if (imageUrls.length) payload.image_urls = imageUrls
    if (videoUrls.length) payload.reference_video_urls = videoUrls
    return payload
  }

  const prompt = omniPrompt(args.prompt, args.camera)
  if (prompt.length < 1) throw new PayloadError('omni video requires a prompt')

  if (args.mode === 'text') {
    return {
      prompt,
      duration: omniDuration(args.durationSec),
      resolution,
      aspect_ratio: aspectRatio,
    }
  }

  const imageUrl = args.imageUrl?.trim()
  if (!imageUrl) throw new PayloadError('omni image-to-video requires image_url')
  const payload: Record<string, unknown> = {
    prompt,
    image_url: imageUrl,
    duration: omniDuration(args.durationSec),
    resolution,
    aspect_ratio: aspectRatio,
  }
  if (args.mode === 'first_last') {
    const endImageUrl = args.endImageUrl?.trim()
    if (!endImageUrl) throw new PayloadError('omni first-last requires end_image_url')
    payload.end_image_url = endImageUrl
  }
  return payload
}
