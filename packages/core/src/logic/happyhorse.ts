import type { FamilyFieldMap, Mode } from '../types/provider'
import { PayloadError } from './payload'
import { cameraSentence, capPromptText, type PromptCamera } from './identity'
import type { ModeModel } from './modePipeline'

/**
 * HappyHorse 1.0 field map from OpenAPI on 2026-09-25.
 * alibaba/happy-horse/text-to-video, image-to-video, reference-to-video, and video-edit — 200.
 * alibaba/happy-horse/v1.1/text-to-video, image-to-video, and reference-to-video — 200.
 * v1.1/video-edit — 404. v1.1 does not replace 1.0. It is not this registry id.
 * fal-ai/happy-horse/text-to-video — 200 and matches the unversioned text schema. The registry uses alibaba/.
 * Text has no image_url. Image requires image_url and has no aspect.
 * Reference files are image_urls, described as 1-9. The prompt names them character1, character2.
 * Video edit requires video_url and prompt. Reference images are reference_image_urls, up to 5, named @Image1.
 * Duration is an integer enum 3-15. There is no duration on video edit.
 * Prompt text says max 2500 characters. The property has no maxLength.
 * Text, image, and reference have no audio field. Video edit audio_setting is auto|origin.
 * Submit sends origin on an edit so the model does not regenerate the track.
 * enable_safety_checker stays omitted.
 * This id is not in the default council. It joins the routing pool only after one clean generation.
 */

export const HAPPYHORSE_TEXT = 'alibaba/happy-horse/text-to-video'
export const HAPPYHORSE_IMAGE = 'alibaba/happy-horse/image-to-video'
export const HAPPYHORSE_REFERENCE = 'alibaba/happy-horse/reference-to-video'
export const HAPPYHORSE_EDIT = 'alibaba/happy-horse/video-edit'
export const HAPPYHORSE_11_TEXT = 'alibaba/happy-horse/v1.1/text-to-video'
export const HAPPYHORSE_11_IMAGE = 'alibaba/happy-horse/v1.1/image-to-video'
export const HAPPYHORSE_11_REFERENCE = 'alibaba/happy-horse/v1.1/reference-to-video'

export const HAPPYHORSE_ENDPOINTS: Partial<Record<Mode, string>> = {
  text: HAPPYHORSE_TEXT,
  first_frame: HAPPYHORSE_IMAGE,
  reference: HAPPYHORSE_REFERENCE,
  video_edit: HAPPYHORSE_EDIT,
}

export const HAPPYHORSE_DURATION = [3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15] as const
export const HAPPYHORSE_RESOLUTION = ['720p', '1080p'] as const
export const HAPPYHORSE_ASPECT = ['16:9', '9:16', '1:1', '4:3', '3:4'] as const
export const HAPPYHORSE_PROMPT_MAX = 2500
export const HAPPYHORSE_REFERENCE_CAP = 9
export const HAPPYHORSE_EDIT_CAP = 5

export const HAPPYHORSE_FIELDS: FamilyFieldMap = {
  firstFrame: 'image_url',
  references: { mode: 'field', field: 'image_urls', max: HAPPYHORSE_REFERENCE_CAP },
  duration: { field: 'duration', kind: 'enum', values: [...HAPPYHORSE_DURATION] },
  audio: { field: '', kind: 'native_always' },
  resolution: { field: 'resolution', values: [...HAPPYHORSE_RESOLUTION] },
  aspect: { field: 'aspect_ratio', values: [...HAPPYHORSE_ASPECT] },
  seed: 'seed',
}

export function happyhorseModeModel(): ModeModel {
  return {
    id: 'happyhorse-1.0',
    provider: 'fal',
    endpoints: HAPPYHORSE_ENDPOINTS,
    fields: HAPPYHORSE_FIELDS,
    limits: { maxPromptChars: HAPPYHORSE_PROMPT_MAX },
    nativeAudio: true,
  }
}

export function happyhorseDuration(seconds: number | undefined): number {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return 5
  const target = Math.round(seconds)
  let best: number = HAPPYHORSE_DURATION[0]
  let distance = Infinity
  for (const value of HAPPYHORSE_DURATION) {
    const gap = Math.abs(value - target)
    if (gap < distance || (gap === distance && value > best)) {
      distance = gap
      best = value
    }
  }
  return best
}

function snap(value: string | undefined, allowed: readonly string[], fallback: string): string {
  if (value && allowed.includes(value)) return value
  return fallback
}

function happyhorsePrompt(prompt: string, camera?: PromptCamera | null, prefix?: string): string {
  const line = cameraSentence(camera)?.trim() ?? ''
  const scene = prompt.trim()
  const cameraLine = line && !scene.includes('Camera:') ? line : ''
  const head = prefix && !(prefix.startsWith('@') ? scene.includes('@Image1') : scene.includes('character1'))
    ? prefix
    : ''
  return capPromptText([head, scene, cameraLine].filter(Boolean).join(' '), HAPPYHORSE_PROMPT_MAX)
}

function seedOf(seed: number | undefined): number | undefined {
  if (seed == null || !Number.isFinite(seed) || seed < 0 || seed > 2147483647) return undefined
  return Math.round(seed)
}

export type HappyHorsePayloadKind = 'text' | 'first_frame' | 'reference' | 'video_edit'

export function buildHappyHorsePayload(args: {
  kind: HappyHorsePayloadKind
  prompt: string
  durationSec?: number
  aspectRatio?: string
  resolution?: string
  imageUrl?: string
  imageUrls?: string[]
  names?: string[]
  videoUrl?: string
  seed?: number
  camera?: PromptCamera | null
}): Record<string, unknown> {
  const resolution = snap(args.resolution, HAPPYHORSE_RESOLUTION, '1080p')
  const seed = seedOf(args.seed)
  if (args.kind === 'video_edit') {
    const videoUrl = args.videoUrl?.trim()
    if (!videoUrl) throw new PayloadError('happyhorse video-edit requires video_url')
    const urls = (args.imageUrls ?? []).map((url) => url.trim()).filter(Boolean).slice(0, HAPPYHORSE_EDIT_CAP)
    const tags = urls.map((_, index) => `@Image${index + 1}`).join(' ')
    const prompt = happyhorsePrompt(args.prompt, args.camera, tags)
    if (prompt.length < 1) throw new PayloadError('happyhorse video-edit requires a prompt')
    const payload: Record<string, unknown> = {
      prompt,
      video_url: videoUrl,
      resolution,
      audio_setting: 'origin',
    }
    if (urls.length) payload.reference_image_urls = urls
    if (seed != null) payload.seed = seed
    return payload
  }
  if (args.kind === 'reference') {
    const urls = (args.imageUrls ?? []).map((url) => url.trim()).filter(Boolean).slice(0, HAPPYHORSE_REFERENCE_CAP)
    if (!urls.length) throw new PayloadError('happyhorse reference-to-video requires image_urls')
    const names = args.names ?? []
    const tags = urls.map((_, index) => {
      const label = names[index]?.trim()
      return label ? `character${index + 1} is ${label}` : `character${index + 1}`
    }).join('. ')
    const prompt = happyhorsePrompt(args.prompt, args.camera, tags)
    if (prompt.length < 1) throw new PayloadError('happyhorse reference-to-video requires a prompt')
    const payload: Record<string, unknown> = {
      prompt,
      image_urls: urls,
      duration: happyhorseDuration(args.durationSec),
      resolution,
      aspect_ratio: snap(args.aspectRatio, HAPPYHORSE_ASPECT, '16:9'),
    }
    if (seed != null) payload.seed = seed
    return payload
  }
  const prompt = happyhorsePrompt(args.prompt, args.camera)
  const duration = happyhorseDuration(args.durationSec)
  if (args.kind === 'text') {
    if (prompt.length < 1) throw new PayloadError('happyhorse text-to-video requires a prompt')
    const payload: Record<string, unknown> = {
      prompt,
      duration,
      resolution,
      aspect_ratio: snap(args.aspectRatio, HAPPYHORSE_ASPECT, '16:9'),
    }
    if (seed != null) payload.seed = seed
    return payload
  }
  const imageUrl = args.imageUrl?.trim()
  if (!imageUrl) throw new PayloadError('happyhorse image-to-video requires image_url')
  const payload: Record<string, unknown> = { image_url: imageUrl, duration, resolution }
  if (prompt.length >= 1) payload.prompt = prompt
  if (seed != null) payload.seed = seed
  return payload
}
