import type { FamilyFieldMap, Mode } from '../types/provider'
import { PayloadError } from './payload'
import { cameraSentence, capPromptText, type PromptCamera } from './identity'
import type { ModeModel } from './modePipeline'

/**
 * Seedance 2.0 field map from OpenAPI 200 on 2026-09-24.
 * Duration is a string enum of whole seconds ("4".."15" or "auto"), not "5s".
 * Prompt has no maxLength. The 2.0 input has no seed and no negative_prompt.
 * generate_audio exists on the schema. Live submit still forces it false.
 * Reference files are image_urls (≤9), video_urls (≤3), audio_urls (≤3), total ≤12.
 * Tags in the prompt are @ImageN / @VideoN / @AudioN.
 *
 * Seedance 2.5 text-to-video and reference-to-video also returned 200.
 * They are not the pool id. Fast variants returned 200 and are not the pool id.
 */

export const SEEDANCE_ENDPOINTS: Partial<Record<Mode, string>> = {
  text: 'bytedance/seedance-2.0/text-to-video',
  first_frame: 'bytedance/seedance-2.0/image-to-video',
  first_last: 'bytedance/seedance-2.0/image-to-video',
  reference: 'bytedance/seedance-2.0/reference-to-video',
}

export const SEEDANCE_25_VERIFIED = {
  text: 'bytedance/seedance-2.5/text-to-video',
  reference: 'bytedance/seedance-2.5/reference-to-video',
} as const

export const SEEDANCE_DURATION = ['auto', '4', '5', '6', '7', '8', '9', '10', '11', '12', '13', '14', '15'] as const
export const SEEDANCE_RESOLUTION = ['480p', '720p', '1080p', '4k'] as const
export const SEEDANCE_ASPECT = ['auto', '21:9', '16:9', '4:3', '1:1', '3:4', '9:16'] as const

export const SEEDANCE_CAPS = { images: 9, videos: 3, audios: 3, total: 12 } as const

export const SEEDANCE_FIELDS: FamilyFieldMap = {
  firstFrame: 'image_url',
  lastFrame: 'end_image_url',
  references: { mode: 'prompt_tag', tag: '@', max: SEEDANCE_CAPS.total },
  duration: { field: 'duration', kind: 'enum', values: [...SEEDANCE_DURATION] },
  audio: { field: 'generate_audio', kind: 'bool' },
  resolution: { field: 'resolution', values: [...SEEDANCE_RESOLUTION] },
  aspect: { field: 'aspect_ratio', values: [...SEEDANCE_ASPECT] },
}

export function seedanceModeModel(): ModeModel {
  return {
    id: 'seedance-2.0',
    provider: 'fal',
    endpoints: SEEDANCE_ENDPOINTS,
    fields: SEEDANCE_FIELDS,
    limits: { maxPromptChars: 0 },
    nativeAudio: true,
  }
}

export type SeedanceImageRole = 'character' | 'location' | 'style' | 'prop'
export type SeedanceVideoRole = 'motion_ref' | 'style_ref' | 'continuation'
export type SeedanceAudioRole = 'dialogue' | 'music' | 'sfx'

export interface SeedanceImageSlot {
  tag: string
  role: SeedanceImageRole
  assetId: string
  label?: string
}

export interface SeedanceVideoSlot {
  tag: string
  role: SeedanceVideoRole
  assetId: string
  label?: string
}

export interface SeedanceAudioSlot {
  tag: string
  role: SeedanceAudioRole
  assetId: string
  label?: string
}

export interface SeedanceComposition {
  images: SeedanceImageSlot[]
  videos: SeedanceVideoSlot[]
  audios: SeedanceAudioSlot[]
}

export interface SeedanceCandidate {
  url: string
  label?: string
  bucket: 'image' | 'video' | 'audio'
  role: SeedanceImageRole | SeedanceVideoRole | SeedanceAudioRole
  primary?: boolean
}

function rank(candidate: SeedanceCandidate): number {
  if (candidate.bucket === 'image' && candidate.role === 'character' && candidate.primary) return 0
  if (candidate.bucket === 'image' && candidate.role === 'location') return 1
  if (candidate.bucket === 'audio' && candidate.role === 'dialogue') return 2
  if (candidate.bucket === 'video') return 3
  if (candidate.bucket === 'image' && candidate.role === 'character') return 4
  if (candidate.bucket === 'audio') return 5
  return 6
}

/**
 * Pick within 9 images, 3 videos, 3 audio, and 12 total.
 * There is no per-shot angle retriever in the repo, so the primary stored
 * reference for each character is the one the caller marks primary.
 */
export function selectReferences(candidates: SeedanceCandidate[]): SeedanceComposition {
  const ordered = candidates
    .filter((candidate) => candidate.url.trim().length > 0)
    .sort((a, b) => rank(a) - rank(b))
  const images: SeedanceImageSlot[] = []
  const videos: SeedanceVideoSlot[] = []
  const audios: SeedanceAudioSlot[] = []
  const seen = new Set<string>()
  let total = 0
  for (const candidate of ordered) {
    if (total >= SEEDANCE_CAPS.total) break
    const url = candidate.url.trim()
    if (seen.has(url)) continue
    if (candidate.bucket === 'image') {
      if (images.length >= SEEDANCE_CAPS.images) continue
      if (candidate.role === 'motion_ref' || candidate.role === 'style_ref' || candidate.role === 'continuation') continue
      if (candidate.role === 'dialogue' || candidate.role === 'music' || candidate.role === 'sfx') continue
      images.push({ tag: '', role: candidate.role, assetId: url, label: candidate.label })
    } else if (candidate.bucket === 'video') {
      if (videos.length >= SEEDANCE_CAPS.videos) continue
      if (candidate.role !== 'motion_ref' && candidate.role !== 'style_ref' && candidate.role !== 'continuation') continue
      videos.push({ tag: '', role: candidate.role, assetId: url, label: candidate.label })
    } else {
      if (audios.length >= SEEDANCE_CAPS.audios) continue
      if (candidate.role !== 'dialogue' && candidate.role !== 'music' && candidate.role !== 'sfx') continue
      audios.push({ tag: '', role: candidate.role, assetId: url, label: candidate.label })
    }
    seen.add(url)
    total += 1
  }
  images.forEach((slot, index) => { slot.tag = `@Image${index + 1}` })
  videos.forEach((slot, index) => { slot.tag = `@Video${index + 1}` })
  audios.forEach((slot, index) => { slot.tag = `@Audio${index + 1}` })
  return { images, videos, audios }
}

function describe(slot: { label?: string; role: string }): string {
  const label = slot.label?.trim()
  return label || slot.role
}

function joinPrompt(roleLine: string, scene: string, camera: string, maxPromptChars?: number): string {
  const head = roleLine ? `${roleLine}.` : ''
  if (!maxPromptChars || maxPromptChars <= 0) {
    return [head, scene, camera].filter(Boolean).join(' ').trim()
  }
  const cameraPart = camera ? ` ${camera}` : ''
  const room = maxPromptChars - head.length - (head ? 1 : 0) - cameraPart.length
  const sceneFit = room > 0 ? capPromptText(scene, room) : ''
  const withScene = [head, sceneFit].filter(Boolean).join(' ').trim()
  if (!camera || withScene.length + cameraPart.length > maxPromptChars) return withScene
  return `${withScene}${cameraPart}`.trim()
}

export function composeSeedanceReference(args: {
  prompt: string
  camera?: PromptCamera | null
  composition: SeedanceComposition
  maxPromptChars?: number
}): { prompt: string; image_urls: string[]; video_urls: string[]; audio_urls: string[] } {
  const slots = [...args.composition.images, ...args.composition.videos, ...args.composition.audios]
  const roleLine = slots.map((slot) => `${slot.tag} is ${describe(slot)}`).join(', ')
  const scene = args.prompt.trim()
  const camera = cameraSentence(args.camera)?.trim() ?? ''
  return {
    prompt: joinPrompt(roleLine, scene, camera, args.maxPromptChars),
    image_urls: args.composition.images.map((slot) => slot.assetId),
    video_urls: args.composition.videos.map((slot) => slot.assetId),
    audio_urls: args.composition.audios.map((slot) => slot.assetId),
  }
}

export function seedanceDuration(seconds: number | undefined): string {
  const numeric = SEEDANCE_DURATION.filter((value) => value !== 'auto')
  if (seconds == null || !Number.isFinite(seconds) || seconds <= 0) return 'auto'
  const target = Math.round(seconds)
  let best: string = numeric[0]
  let distance = Infinity
  for (const value of numeric) {
    const gap = Math.abs(Number(value) - target)
    if (gap < distance) {
      distance = gap
      best = value
    }
  }
  return best
}

function snapAllowed(value: string | undefined, allowed: readonly string[], fallback: string): string {
  if (value && allowed.includes(value)) return value
  return fallback
}

export function buildSeedancePayload(args: {
  mode: 'text' | 'first_frame' | 'first_last' | 'reference'
  prompt: string
  durationSec?: number
  imageUrl?: string
  endImageUrl?: string
  resolution?: string
  aspectRatio?: string
  camera?: PromptCamera | null
  composition?: SeedanceComposition
}): Record<string, unknown> {
  const prompt = args.prompt.trim()
  if (prompt.length < 3 && args.mode !== 'reference') {
    throw new PayloadError('seedance shot has no prompt')
  }
  const shared = {
    duration: seedanceDuration(args.durationSec),
    resolution: snapAllowed(args.resolution, SEEDANCE_RESOLUTION, '720p'),
    aspect_ratio: snapAllowed(args.aspectRatio, SEEDANCE_ASPECT, '16:9'),
    generate_audio: false,
  }
  if (args.mode === 'text') return { prompt, ...shared }
  if (args.mode === 'first_frame' || args.mode === 'first_last') {
    const imageUrl = args.imageUrl?.trim()
    if (!imageUrl) throw new PayloadError('seedance image-to-video requires image_url')
    const payload: Record<string, unknown> = { prompt, image_url: imageUrl, ...shared }
    if (args.mode === 'first_last') {
      const endImageUrl = args.endImageUrl?.trim()
      if (!endImageUrl) throw new PayloadError('seedance first/last requires end_image_url')
      payload.end_image_url = endImageUrl
    }
    return payload
  }
  const composition = args.composition ?? { images: [], videos: [], audios: [] }
  if (composition.images.length + composition.videos.length < 1) {
    throw new PayloadError('seedance reference-to-video requires an image or a video')
  }
  const composed = composeSeedanceReference({
    prompt: prompt || 'the scene',
    camera: args.camera,
    composition,
    maxPromptChars: seedanceModeModel().limits.maxPromptChars,
  })
  if (composed.prompt.trim().length < 3) throw new PayloadError('seedance shot has no prompt')
  const payload: Record<string, unknown> = { prompt: composed.prompt, ...shared }
  if (composed.image_urls.length) payload.image_urls = composed.image_urls
  if (composed.video_urls.length) payload.video_urls = composed.video_urls
  if (composed.audio_urls.length) payload.audio_urls = composed.audio_urls
  return payload
}

/** Council preference. Exact-frame continuation stays on first-frame, not reference. */
export function prefersSeedanceReference(shot: {
  hasDialogue?: boolean
  charactersPresent?: string[]
  locationsPresent?: string[]
  characterIds?: string[]
  locationId?: string | null
  continueExactFrame?: boolean
  anchorSource?: string
  hasStyleOrMotionRef?: boolean
}): boolean {
  if (shot.continueExactFrame === true || shot.anchorSource === 'auto') return false
  const characters = Math.max(shot.characterIds?.length ?? 0, shot.charactersPresent?.length ?? 0)
  const hasLocation = Boolean(shot.locationId) || (shot.locationsPresent?.length ?? 0) > 0
  if (characters >= 2) return true
  if (characters >= 1 && hasLocation) return true
  if (shot.hasDialogue && characters >= 1) return true
  if (shot.hasStyleOrMotionRef) return true
  return false
}
