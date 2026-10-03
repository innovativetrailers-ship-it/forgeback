import type { FamilyFieldMap, Mode } from '../types/provider'
import { PayloadError } from './payload'
import { cameraSentence, capPromptText, type PromptCamera } from './identity'
import type { ModeModel } from './modePipeline'

/**
 * Grok Imagine video field map from OpenAPI on 2026-09-25.
 * xai/grok-imagine-video/v1.5/text-to-video, image-to-video, and reference-to-video — 200.
 * The unversioned text, image, and reference endpoints also returned 200.
 * v1.5 is the registry target: text and image accept 1080p, and reference duration goes to 15.
 * fal-ai/grok-imagine-video/text-to-video — 404.
 * xai/grok-imagine-video with no mode, and xai/grok-imagine-video/edit, are image APIs. Not video.
 * Text is prompt only. Image requires image_url and has no aspect and no last frame.
 * Reference requires reference_image_urls, max 7. Tags are <IMAGE_0>, zero-indexed.
 * The unversioned reference schema uses @Image1 and caps duration at 10. That is not this id.
 * Duration is an integer 1-15. Prompt maxLength is 4096. No seed.
 * None of the video inputs have an audio field. Native audio stays on because it cannot be switched off.
 * The direct xAI client stays retired.
 */

export const GROK_V15_TEXT = 'xai/grok-imagine-video/v1.5/text-to-video'
export const GROK_V15_IMAGE = 'xai/grok-imagine-video/v1.5/image-to-video'
export const GROK_V15_REFERENCE = 'xai/grok-imagine-video/v1.5/reference-to-video'
export const GROK_BASE_TEXT = 'xai/grok-imagine-video/text-to-video'
export const GROK_BASE_IMAGE = 'xai/grok-imagine-video/image-to-video'
export const GROK_BASE_REFERENCE = 'xai/grok-imagine-video/reference-to-video'

export const GROK_ENDPOINTS: Partial<Record<Mode, string>> = {
  text: GROK_V15_TEXT,
  first_frame: GROK_V15_IMAGE,
  reference: GROK_V15_REFERENCE,
}

export const GROK_TEXT_RESOLUTION = ['480p', '720p', '1080p'] as const
export const GROK_REFERENCE_RESOLUTION = ['480p', '720p'] as const
export const GROK_ASPECT = ['16:9', '4:3', '3:2', '1:1', '2:3', '3:4', '9:16'] as const
export const GROK_PROMPT_MAX = 4096
export const GROK_REFERENCE_CAP = 7

export const GROK_FIELDS: FamilyFieldMap = {
  firstFrame: 'image_url',
  references: { mode: 'field', field: 'reference_image_urls', max: GROK_REFERENCE_CAP },
  duration: { field: 'duration', kind: 'number', min: 1, max: 15 },
  audio: { field: '', kind: 'native_always' },
  resolution: { field: 'resolution', values: [...GROK_TEXT_RESOLUTION] },
  aspect: { field: 'aspect_ratio', values: [...GROK_ASPECT] },
}

export function grokModeModel(): ModeModel {
  return {
    id: 'grok-imagine-video',
    provider: 'fal',
    endpoints: GROK_ENDPOINTS,
    fields: GROK_FIELDS,
    limits: { maxPromptChars: GROK_PROMPT_MAX },
    nativeAudio: true,
  }
}

export function grokDuration(seconds: number | undefined, reference = false): number {
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return reference ? 8 : 6
  return Math.min(15, Math.max(1, Math.round(seconds)))
}

function snap(value: string | undefined, allowed: readonly string[], fallback: string): string {
  if (value && (allowed as readonly string[]).includes(value)) return value
  return fallback
}

function grokPrompt(prompt: string, camera?: PromptCamera | null, prefix?: string): string {
  const line = cameraSentence(camera)?.trim() ?? ''
  const scene = prompt.trim()
  const cameraLine = line && !scene.includes('Camera:') ? line : ''
  const head = prefix && !scene.includes('<IMAGE_0>') ? prefix : ''
  return capPromptText([head, scene, cameraLine].filter(Boolean).join(' '), GROK_PROMPT_MAX)
}

function referencePrefix(labels: string[]): string {
  return labels.map((label, index) => {
    const tag = `<IMAGE_${index}>`
    return label.trim() ? `${tag} is ${label.trim()}` : tag
  }).join('. ')
}

export function buildGrokPayload(args: {
  mode: 'text' | 'first_frame' | 'reference'
  prompt: string
  durationSec?: number
  aspectRatio?: string
  resolution?: string
  imageUrl?: string
  imageUrls?: string[]
  names?: string[]
  camera?: PromptCamera | null
}): Record<string, unknown> {
  if (args.mode === 'reference') {
    const urls: string[] = []
    const labels: string[] = []
    const named = args.names ?? []
    const incoming = args.imageUrls ?? []
    incoming.forEach((url, index) => {
      const clean = url.trim()
      if (!clean || urls.includes(clean) || urls.length >= GROK_REFERENCE_CAP) return
      urls.push(clean)
      labels.push(named[index]?.trim() ?? '')
    })
    if (!urls.length) throw new PayloadError('grok reference-to-video requires reference_image_urls')
    const prompt = grokPrompt(args.prompt, args.camera, referencePrefix(labels))
    if (prompt.length < 1) throw new PayloadError('grok reference-to-video requires a prompt')
    return {
      prompt,
      reference_image_urls: urls,
      duration: grokDuration(args.durationSec, true),
      resolution: snap(args.resolution === '1080p' ? '720p' : args.resolution, GROK_REFERENCE_RESOLUTION, '480p'),
      aspect_ratio: snap(args.aspectRatio, GROK_ASPECT, '16:9'),
    }
  }
  const prompt = grokPrompt(args.prompt, args.camera)
  if (prompt.length < 1) throw new PayloadError('grok video requires a prompt')
  const duration = grokDuration(args.durationSec, false)
  const resolution = snap(args.resolution, GROK_TEXT_RESOLUTION, '720p')
  if (args.mode === 'text') {
    return {
      prompt,
      duration,
      resolution,
      aspect_ratio: snap(args.aspectRatio, GROK_ASPECT, '16:9'),
    }
  }
  const imageUrl = args.imageUrl?.trim()
  if (!imageUrl) throw new PayloadError('grok image-to-video requires image_url')
  return { prompt, image_url: imageUrl, duration, resolution }
}
