import type { FamilyFieldMap, Mode } from '../types/provider'
import { clampDuration, logPayloadClamp, PayloadError, type DurationConstraint, type PayloadBuildOptions } from './payload'
import { cameraSentence, capPromptText, type PromptCamera } from './identity'
import type { ModeModel } from './modePipeline'

/**
 * Kling 3.0 field map from OpenAPI on 2026-09-24.
 * fal-ai/kling-video/v3/pro/text-to-video — 200.
 * fal-ai/kling-video/v3/pro/image-to-video — 200. Required start_image_url.
 *   end_image_url is optional. elements is a field on this input, not its own endpoint.
 * fal-ai/kling-video/v3/pro/elements — 404. Do not register that id.
 * fal-ai/kling-video/o3/standard/video-to-video/edit — 200. Required prompt + video_url.
 * Prompt maxLength is 2500. Duration enum is "3".."15" with no "auto".
 * No resolution field. No seed. aspect_ratio is on text-to-video only.
 * generate_audio exists and stays false on submit.
 * The schema tells the prompt to name elements as @Element1, @Element2.
 * v2.5-turbo and v2.1 ids were checked and are not pool models, so they are not registered.
 */

export const KLING_V3_TEXT = 'fal-ai/kling-video/v3/pro/text-to-video'
export const KLING_V3_IMAGE = 'fal-ai/kling-video/v3/pro/image-to-video'
export const KLING_O3_EDIT = 'fal-ai/kling-video/o3/standard/video-to-video/edit'

export const KLING_ENDPOINTS: Partial<Record<Mode, string>> = {
  text: KLING_V3_TEXT,
  first_frame: KLING_V3_IMAGE,
  first_last: KLING_V3_IMAGE,
  reference: KLING_V3_IMAGE,
  video_edit: KLING_O3_EDIT,
}

export const KLING_DURATION = ['3', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'] as const
/** v2.x and v1. v3/o3 use KLING_DURATION. */
export const KLING_V2_DURATION = ['5', '10'] as const
export const KLING_ASPECT = ['16:9', '9:16', '1:1'] as const
export const KLING_PROMPT_MAX = 2500
export const KLING_REFERENCE_IMAGES = 3

export const KLING_FIELDS: FamilyFieldMap = {
  firstFrame: 'start_image_url',
  lastFrame: 'end_image_url',
  references: { mode: 'field', field: 'elements', max: KLING_REFERENCE_IMAGES },
  duration: {
    field: 'duration',
    kind: 'range',
    min: Number(KLING_DURATION[0]),
    max: Number(KLING_DURATION[KLING_DURATION.length - 1]),
    values: [...KLING_DURATION],
  },
  audio: { field: 'generate_audio', kind: 'bool' },
  aspect: { field: 'aspect_ratio', values: [...KLING_ASPECT] },
  negative: 'negative_prompt',
}

export function klingModeModel(): ModeModel {
  return {
    id: 'kling-3.0',
    provider: 'fal',
    endpoints: KLING_ENDPOINTS,
    fields: KLING_FIELDS,
    limits: { maxPromptChars: KLING_PROMPT_MAX },
    nativeAudio: true,
  }
}

export interface KlingElement {
  frontal_image_url?: string
  reference_image_urls?: string[]
  video_url?: string
}

export interface KlingElementSource {
  frontal: string
  angles?: string[]
  videoUrl?: string
}

export function klingDurationValues(endpoint?: string): readonly string[] {
  if (endpoint && endpoint.includes('kling-video') && !endpoint.includes('/v3/') && !endpoint.includes('/o3/')) {
    return KLING_V2_DURATION
  }
  return KLING_DURATION
}

export function klingDurationConstraint(endpoint?: string): DurationConstraint {
  const v2 = Boolean(endpoint && endpoint.includes('kling-video') && !endpoint.includes('/v3/') && !endpoint.includes('/o3/'))
  if (v2) return { shape: 'set', values: KLING_V2_DURATION, fallback: 5 }
  return {
    shape: 'range',
    min: Number(KLING_DURATION[0]),
    max: Number(KLING_DURATION[KLING_DURATION.length - 1]),
    wire: 'string',
    fallback: 5,
  }
}

export function klingDuration(
  seconds: number | undefined,
  endpoint?: string,
  onClamp: PayloadBuildOptions['onClamp'] = logPayloadClamp,
): string {
  return String(clampDuration(seconds, klingDurationConstraint(endpoint), endpoint ?? KLING_V3_TEXT, onClamp))
}

export function klingElements(sources: KlingElementSource[]): KlingElement[] {
  const elements: KlingElement[] = []
  for (const source of sources) {
    const videoUrl = source.videoUrl?.trim()
    if (videoUrl) {
      elements.push({ video_url: videoUrl })
      continue
    }
    const frontal = source.frontal?.trim()
    if (!frontal) continue
    const angles = (source.angles ?? [])
      .map((url) => url.trim())
      .filter((url) => url.length > 0 && url !== frontal)
      .slice(0, KLING_REFERENCE_IMAGES)
    const element: KlingElement = { frontal_image_url: frontal }
    if (angles.length) element.reference_image_urls = angles
    elements.push(element)
  }
  return elements
}

export function klingElementTags(count: number): string[] {
  return Array.from({ length: count }, (_, index) => `@Element${index + 1}`)
}

export function withKlingElementTags(prompt: string, count: number): string {
  const tags = klingElementTags(count)
  const missing = tags.filter((tag) => !prompt.includes(tag))
  if (!missing.length) return prompt.trim()
  return `${prompt.trim()} ${missing.join(' ')}`.trim()
}

function capKlingPrompt(prompt: string, max = KLING_PROMPT_MAX): string {
  const tags = prompt.match(/(?: @Element\d+)+$/)?.[0] ?? ''
  if (!tags) return capPromptText(prompt, max)
  if (prompt.length <= max) return prompt
  const head = capPromptText(prompt.slice(0, prompt.length - tags.length), max - tags.length)
  return `${head}${tags}`.trim()
}

function snapAspect(value: string | undefined): string {
  if (value && (KLING_ASPECT as readonly string[]).includes(value)) return value
  return '16:9'
}

export function buildKlingPayload(args: {
  mode: 'text' | 'first_frame' | 'first_last' | 'reference' | 'video_edit'
  prompt: string
  durationSec?: number
  aspectRatio?: string
  negativePrompt?: string
  imageUrl?: string
  endImageUrl?: string
  videoUrl?: string
  camera?: PromptCamera | null
  elements?: KlingElement[]
}): Record<string, unknown> {
  const camera = cameraSentence(args.camera)?.trim() ?? ''
  const scene = [args.prompt.trim(), camera].filter(Boolean).join(' ')
  if (args.mode === 'video_edit') {
    const videoUrl = args.videoUrl?.trim()
    if (!videoUrl) throw new PayloadError('kling video edit requires video_url')
    const prompt = capKlingPrompt(withKlingElementTags(scene, args.elements?.length ?? 0))
    if (prompt.length < 3) throw new PayloadError('kling shot has no prompt')
    const payload: Record<string, unknown> = { prompt, video_url: videoUrl }
    if (args.elements?.length) payload.elements = args.elements
    return payload
  }
  const elements = args.mode === 'text' ? [] : (args.elements ?? [])
  if (args.mode === 'reference' && elements.length < 1) {
    throw new PayloadError('kling elements require a frontal image on image-to-video')
  }
  const prompt = capKlingPrompt(withKlingElementTags(scene, elements.length))
  if (prompt.length < 3) throw new PayloadError('kling shot has no prompt')
  const payload: Record<string, unknown> = {
    prompt,
    duration: klingDuration(args.durationSec),
    generate_audio: false,
  }
  if (args.mode === 'text') payload.aspect_ratio = snapAspect(args.aspectRatio)
  const negative = args.negativePrompt?.trim()
  if (negative) payload.negative_prompt = capPromptText(negative, KLING_PROMPT_MAX)
  if (args.mode === 'text') return payload
  const imageUrl = args.imageUrl?.trim()
  if (!imageUrl) throw new PayloadError('kling image-to-video requires start_image_url')
  payload.start_image_url = imageUrl
  if (args.mode === 'first_last' || args.endImageUrl?.trim()) {
    const endImageUrl = args.endImageUrl?.trim()
    if (!endImageUrl) throw new PayloadError('kling first/last requires end_image_url')
    payload.end_image_url = endImageUrl
  }
  if (elements.length) payload.elements = elements
  return payload
}
