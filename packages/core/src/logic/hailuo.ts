import type { FamilyFieldMap, Mode } from '../types/provider'
import { logPayloadClamp, PayloadError, type PayloadBuildOptions } from './payload'
import { cameraSentence, capPromptText, type PromptCamera } from './identity'
import type { ModeModel } from './modePipeline'

/**
 * Hailuo 02 field map from OpenAPI on 2026-09-24.
 * fal-ai/minimax/hailuo-02/pro/text-to-video — 200. prompt maxLength 2000.
 *   No duration, resolution, seed, or audio_url.
 * fal-ai/minimax/hailuo-02/pro/image-to-video — 200. Required prompt + image_url.
 *   end_image_url is optional. No separate first-last endpoint (that id 404s).
 * fal-ai/minimax/hailuo-02/standard/text-to-video and standard/image-to-video — 200.
 * fal-ai/minimax/hailuo-02-fast/image-to-video — 200. Duration enum "6"|"10".
 *   fast text-to-video — 404. fast has no end_image_url and no resolution.
 * Reference-to-video — 404. No reference field.
 * prompt_optimizer defaults true and rewrites the prompt, so submit sends false.
 * Hailuo 2.3 pro and standard text and image returned 200. 2.3 pro has no last
 * frame and no duration. It stays off this registry id. The existing 2.3 client
 * still hits those endpoints; the sealer strips fields the schema does not list.
 * H3-style ids that were probed returned 404.
 */

export const HAILUO_PRO_TEXT = 'fal-ai/minimax/hailuo-02/pro/text-to-video'
export const HAILUO_PRO_IMAGE = 'fal-ai/minimax/hailuo-02/pro/image-to-video'
export const HAILUO_FAST_IMAGE = 'fal-ai/minimax/hailuo-02-fast/image-to-video'
export const HAILUO_23_STANDARD_TEXT = 'fal-ai/minimax/hailuo-2.3/standard/text-to-video'
export const HAILUO_23_STANDARD_IMAGE = 'fal-ai/minimax/hailuo-2.3/standard/image-to-video'
export const HAILUO_23_PRO_TEXT = 'fal-ai/minimax/hailuo-2.3/pro/text-to-video'
export const HAILUO_23_PRO_IMAGE = 'fal-ai/minimax/hailuo-2.3/pro/image-to-video'

export const HAILUO_ENDPOINTS: Partial<Record<Mode, string>> = {
  text: HAILUO_PRO_TEXT,
  first_frame: HAILUO_PRO_IMAGE,
  first_last: HAILUO_PRO_IMAGE,
}

export const HAILUO_DURATION = ['6', '10'] as const
export const HAILUO_PROMPT_MAX = 2000

export const HAILUO_FIELDS: FamilyFieldMap = {
  firstFrame: 'image_url',
  lastFrame: 'end_image_url',
  references: { mode: 'field', max: 0 },
  duration: { field: 'duration', kind: 'enum', values: [...HAILUO_DURATION] },
  audio: { field: 'audio_url', kind: 'native_always' },
  resolution: { field: 'resolution', values: ['512P', '768P'] },
}

export function hailuoModeModel(): ModeModel {
  return {
    id: 'hailuo-02',
    provider: 'fal',
    endpoints: HAILUO_ENDPOINTS,
    fields: HAILUO_FIELDS,
    limits: { maxPromptChars: HAILUO_PROMPT_MAX },
    nativeAudio: false,
  }
}

export function hailuoDuration(
  seconds: number | undefined,
  onClamp: PayloadBuildOptions['onClamp'] = logPayloadClamp,
): (typeof HAILUO_DURATION)[number] {
  const picked = seconds == null || !Number.isFinite(seconds) || Math.round(seconds) <= 6
    ? HAILUO_DURATION[0]
    : HAILUO_DURATION[1]
  onClamp?.('duration', seconds, picked, 'fal-ai/minimax/hailuo-02-fast/image-to-video')
  return picked
}

function hailuoPrompt(prompt: string, camera?: PromptCamera | null): string {
  const line = cameraSentence(camera)?.trim() ?? ''
  return capPromptText([prompt.trim(), line].filter(Boolean).join(' '), HAILUO_PROMPT_MAX)
}

export type HailuoPayloadKind =
  | 'pro_text'
  | 'pro_image'
  | 'fast_image'
  | 'standard_text'
  | 'standard_image'

export function buildHailuoPayload(args: {
  kind: HailuoPayloadKind
  prompt: string
  durationSec?: number
  imageUrl?: string
  endImageUrl?: string
  camera?: PromptCamera | null
}): Record<string, unknown> {
  const prompt = hailuoPrompt(args.prompt, args.camera)
  if (prompt.length < 3) throw new PayloadError('hailuo shot has no prompt')
  const base = { prompt, prompt_optimizer: false }
  if (args.kind === 'pro_text' || args.kind === 'standard_text') {
    if (args.kind === 'pro_text') return base
    return { ...base, duration: hailuoDuration(args.durationSec) }
  }
  const imageUrl = args.imageUrl?.trim()
  if (!imageUrl) throw new PayloadError('hailuo image-to-video requires image_url')
  if (args.kind === 'fast_image') {
    return { ...base, image_url: imageUrl, duration: hailuoDuration(args.durationSec) }
  }
  if (args.kind === 'standard_image') {
    return { ...base, image_url: imageUrl, duration: hailuoDuration(args.durationSec) }
  }
  const payload: Record<string, unknown> = { ...base, image_url: imageUrl }
  const endImageUrl = args.endImageUrl?.trim()
  if (endImageUrl) payload.end_image_url = endImageUrl
  return payload
}
