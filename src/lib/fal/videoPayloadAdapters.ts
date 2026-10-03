/**
 * Per-endpoint FAL video payload adapters — schema-sync driven.
 * Enum durations, resolutions, and forbidden fields come from FAL OpenAPI (schemaSync).
 */

import { falEndpoint } from '@cinema/core/endpoints'
import {
  ensureKlingTier,
  klingDurationForEndpoint,
  klingEndFrameField,
  klingImageParamForEndpoint,
} from './klingEndpoints'
import { snapLtx23Duration } from './ltxEndpoints'
import {
  buildKlingPayload,
  buildSeedancePayload,
  buildVeoPayload,
  buildWanPayload,
  wanDuration,
  buildHailuoPayload,
  buildWan30Payload,
  buildGrokPayload,
  buildPixversePayload,
  buildHappyHorsePayload,
  buildLtxPayload,
  buildOmniPayload,
  HAPPYHORSE_EDIT,
  HAPPYHORSE_IMAGE,
  HAPPYHORSE_REFERENCE,
  HAPPYHORSE_TEXT,
  LTX_FAST_IMAGE,
  LTX_FAST_TEXT,
  LTX_IMAGE,
  LTX_TEXT,
  GROK_V15_IMAGE,
  GROK_V15_REFERENCE,
  GROK_V15_TEXT,
  OMNI_EDIT,
  OMNI_IMAGE,
  OMNI_REFERENCE,
  OMNI_TEXT,
  PIXVERSE_V4_IMAGE,
  PIXVERSE_V45_TEXT,
  PIXVERSE_V55_IMAGE,
  PIXVERSE_V55_TEXT,
  PIXVERSE_V56_IMAGE,
  PIXVERSE_V56_TEXT,
  PIXVERSE_V56_TRANSITION,
  WAN30_IMAGE,
  WAN30_REFERENCE,
  WAN30_TEXT,
  HAILUO_FAST_IMAGE,
  HAILUO_PRO_IMAGE,
  HAILUO_PRO_TEXT,
  HAILUO_23_PRO_IMAGE,
  HAILUO_23_PRO_TEXT,
  HAILUO_23_STANDARD_IMAGE,
  HAILUO_23_STANDARD_TEXT,
  capPromptText,
  klingDuration,
  klingElements,
  KLING_O3_EDIT,
  KLING_V3_IMAGE,
  KLING_V3_TEXT,
  PayloadError,
  selectReferences,
  VEO_EXTEND,
  VEO_FIRST_LAST,
  VEO_IMAGE,
  VEO_REFERENCE,
  VEO_TEXT,
  WAN_IMAGE,
  WAN_REFERENCE,
  WAN_TEXT,
  type KlingElement,
  type PromptCamera,
  type SeedanceCandidate,
  type SeedanceComposition,
} from '@cinema/core'
import { falLog } from '@/lib/fal/falQueue'
import {
  assemblePayload,
  forceRefreshConstraints,
  getConstraints,
  promptCharLimit,
  type SchemaShotIntent,
} from './schemaSync'
import { FalValidationError } from './falErrors'
import { conditionShotIdentity, type ShotIdentity } from './shotIdentity'

/** VLMs are always silent — soundtrack is mixed from ElevenLabs post-pipeline. */
export type AudioPolicy = 'elevenlabs'

export interface FalVideoIntent {
  prompt: string
  duration: number
  aspectRatio?: string
  imageUrl?: string
  endImageUrl?: string
  negativePrompt?: string
  quality?: string
  audioPolicy?: AudioPolicy
  seed?: number
  resolution?: string
  characterIds?: string[]
  locationId?: string | null
  projectId?: string
  shotIndex?: number
  camera?: PromptCamera | null
  genrePresetId?: string | null
  characterLora?: import('@cinema/core').LoraAssetRef
  styleLora?: import('@cinema/core').LoraAssetRef
  referenceImages?: { url: string; label?: string; role: 'character' | 'location'; primary?: boolean }[]
  referenceVideos?: { url: string; label?: string; role?: 'motion_ref' | 'style_ref' | 'continuation' }[]
  referenceAudios?: { url: string; label?: string; role?: 'dialogue' | 'music' | 'sfx' }[]
  videoUrl?: string
  /** Family-specific fields merged after the routed seal. */
  extraFields?: Record<string, unknown>
}

/** VLMs never generate audio — ElevenLabs owns dialogue/voice. */
export const wantsNativeAudio = (_intent: FalVideoIntent): boolean => false

/** Kling v3 duration enum is "3".."15". "auto" is not in the schema. */
export function klingV3Duration(duration: number | string | undefined): string {
  if (typeof duration === 'number') return klingDuration(duration)
  if (typeof duration === 'string' && duration !== 'auto') {
    const n = parseInt(duration.replace(/s$/i, ''), 10)
    return klingDuration(Number.isNaN(n) ? undefined : n)
  }
  return klingDuration(undefined)
}

function isKlingV3OrO3(falModelId: string): boolean {
  return falModelId.includes('/v3/') || falModelId.includes('/o3/')
}

function intentToShot(intent: FalVideoIntent): SchemaShotIntent {
  return {
    prompt: intent.prompt,
    duration: intent.duration,
    aspectRatio: intent.aspectRatio,
    resolution: intent.resolution,
    anchorUrl: intent.imageUrl,
    imageUrl: intent.imageUrl,
    negativePrompt: intent.negativePrompt,
    quality: intent.quality,
    seed: intent.seed,
    shotIndex: intent.shotIndex,
    characterLora: intent.characterLora,
    styleLora: intent.styleLora,
  }
}

function applyHappyHorseText(
  falModelId: string,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!falModelId.includes('happy-horse') || !falModelId.includes('text-to-video')) return payload
  const out = { ...payload }
  delete out.image_url
  const raw = out.duration
  const parsed = typeof raw === 'number' ? raw : typeof raw === 'string' ? Number(raw) : 3
  out.duration = Number.isFinite(parsed) ? Math.max(3, parsed) : 3
  return out
}

function applyKlingExtras(
  falModelId: string,
  intent: FalVideoIntent,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  const out = { ...payload }

  if (intent.imageUrl) {
    const param = klingImageParamForEndpoint(falModelId)
    if (param !== 'image_url') {
      delete out.image_url
      out[param] = intent.imageUrl
    }
  }

  const endField = klingEndFrameField(falModelId)
  if (intent.endImageUrl && endField) {
    out[endField] = intent.endImageUrl
    if (endField !== 'end_image_url') delete out.end_image_url
  } else {
    delete out.end_image_url
    delete out.tail_image_url
  }

  if (isKlingV3OrO3(falModelId) && out.generate_audio == null) {
    out.generate_audio = false
  }
  if (falModelId.includes('kling-video')) {
    out.duration = klingDurationForEndpoint(falModelId, intent.duration)
    delete out.seed
    delete out.resolution
    if (klingImageParamForEndpoint(falModelId) !== 'image_url') delete out.image_url
  }

  return out
}

function klingElementsForShot(intent: FalVideoIntent, identity: ShotIdentity): KlingElement[] {
  const fromIdentity = klingElementsFromIdentity(identity)
  if (fromIdentity.length) return fromIdentity
  const urls = (intent.referenceImages ?? []).map((ref) => ref.url.trim()).filter(Boolean)
  const frontal = urls[0]
  if (!frontal) return []
  return klingElements([{ frontal, angles: urls.slice(1) }])
}

function klingElementsFromIdentity(identity: ShotIdentity): KlingElement[] {
  const named = identity.namedRefs ?? []
  const all = identity.referenceImages.map((url) => url.trim()).filter(Boolean)
  if (!named.length) {
    const frontal = all[0]
    if (!frontal) return []
    return klingElements([{ frontal, angles: all.slice(1) }])
  }
  return klingElements(named.map((ref, index) => {
    const frontal = ref.url.trim()
    const start = all.indexOf(frontal)
    const nextUrl = named[index + 1]?.url.trim()
    const next = nextUrl ? all.indexOf(nextUrl, start + 1) : all.length
    const end = next === -1 ? all.length : next
    const angles = start === -1 ? [] : all.slice(start + 1, end)
    return { frontal, angles }
  }))
}

function sealKlingPayload(
  falModelId: string,
  payload: Record<string, unknown>,
  intent: FalVideoIntent,
  identity: ShotIdentity,
): Record<string, unknown> {
  const scene = identity.prompt.trim() || (typeof payload.prompt === 'string' ? payload.prompt : intent.prompt)
  if (falModelId === KLING_O3_EDIT) {
    const videoUrl = typeof payload.video_url === 'string' ? payload.video_url : undefined
    return buildKlingPayload({
      mode: 'video_edit',
      prompt: scene,
      videoUrl,
      camera: intent.camera,
      elements: klingElementsForShot(intent, identity),
    })
  }
  if (falModelId !== KLING_V3_TEXT && falModelId !== KLING_V3_IMAGE) return payload
  const elements = klingElementsForShot(intent, identity)
  if (falModelId === KLING_V3_TEXT) {
    const text = buildKlingPayload({
      mode: 'text',
      prompt: scene,
      durationSec: intent.duration,
      aspectRatio: intent.aspectRatio,
      negativePrompt: intent.negativePrompt,
      camera: intent.camera,
      elements,
    })
    if (elements.length) text.elements = elements
    return text
  }
  const imageUrl = intent.imageUrl?.trim()
    || (typeof payload.start_image_url === 'string' ? payload.start_image_url : undefined)
  return buildKlingPayload({
    mode: elements.length ? 'reference' : intent.endImageUrl?.trim() ? 'first_last' : 'first_frame',
    prompt: scene,
    durationSec: intent.duration,
    aspectRatio: intent.aspectRatio,
    negativePrompt: intent.negativePrompt,
    imageUrl,
    endImageUrl: intent.endImageUrl,
    camera: intent.camera,
    elements,
  })
}

function sealVeoPayload(
  falModelId: string,
  payload: Record<string, unknown>,
  intent: FalVideoIntent,
  identity: ShotIdentity,
): Record<string, unknown> {
  const veo = falModelId === VEO_TEXT || falModelId === VEO_IMAGE || falModelId === VEO_REFERENCE
    || falModelId === VEO_FIRST_LAST || falModelId === VEO_EXTEND
  if (!veo) return payload
  const scene = identity.prompt.trim() || (typeof payload.prompt === 'string' ? payload.prompt : intent.prompt)
  const imageUrls = identity.referenceImages.map((url) => url.trim()).filter(Boolean)
  const seed = falModelId === VEO_REFERENCE ? undefined : identity.seed
  if (falModelId === VEO_EXTEND) {
    const videoUrl = typeof payload.video_url === 'string' ? payload.video_url : undefined
    return buildVeoPayload({
      mode: 'video_edit',
      prompt: scene,
      videoUrl,
      aspectRatio: intent.aspectRatio,
      negativePrompt: intent.negativePrompt,
      seed,
      camera: intent.camera,
    })
  }
  if (falModelId === VEO_FIRST_LAST) {
    return buildVeoPayload({
      mode: 'first_last',
      prompt: scene,
      durationSec: intent.duration,
      aspectRatio: intent.aspectRatio,
      resolution: intent.resolution,
      negativePrompt: intent.negativePrompt,
      imageUrl: intent.imageUrl,
      endImageUrl: intent.endImageUrl,
      seed,
      camera: intent.camera,
    })
  }
  if (falModelId === VEO_REFERENCE) {
    return buildVeoPayload({
      mode: 'reference',
      prompt: scene,
      aspectRatio: intent.aspectRatio,
      resolution: intent.resolution,
      imageUrls,
      camera: intent.camera,
    })
  }
  if (falModelId === VEO_IMAGE) {
    return buildVeoPayload({
      mode: 'first_frame',
      prompt: scene,
      durationSec: intent.duration,
      aspectRatio: intent.aspectRatio,
      resolution: intent.resolution,
      negativePrompt: intent.negativePrompt,
      imageUrl: intent.imageUrl || (typeof payload.image_url === 'string' ? payload.image_url : undefined),
      seed,
      camera: intent.camera,
    })
  }
  return buildVeoPayload({
    mode: 'text',
    prompt: scene,
    durationSec: intent.duration,
    aspectRatio: intent.aspectRatio,
    resolution: intent.resolution,
    negativePrompt: intent.negativePrompt,
    seed,
    camera: intent.camera,
  })
}

function sealWanPayload(
  falModelId: string,
  payload: Record<string, unknown>,
  intent: FalVideoIntent,
  identity: ShotIdentity,
): Record<string, unknown> {
  const wan = falModelId === WAN_TEXT || falModelId === WAN_IMAGE || falModelId === WAN_REFERENCE
  if (!wan) return payload
  const scene = identity.prompt.trim() || (typeof payload.prompt === 'string' ? payload.prompt : intent.prompt)
  const seed = identity.seed
  if (falModelId === WAN_REFERENCE) {
    return buildWanPayload({
      mode: 'reference',
      prompt: scene,
      durationSec: intent.duration,
      aspectRatio: intent.aspectRatio,
      resolution: intent.resolution,
      negativePrompt: intent.negativePrompt,
      imageUrls: identity.referenceImages,
      videoUrls: intent.referenceVideos?.map((video) => video.url),
      seed,
      camera: intent.camera,
    })
  }
  if (falModelId === WAN_IMAGE) {
    const imageUrl = intent.imageUrl?.trim()
      || (typeof payload.image_url === 'string' ? payload.image_url : undefined)
    return buildWanPayload({
      mode: intent.endImageUrl?.trim() ? 'first_last' : 'first_frame',
      prompt: scene,
      durationSec: intent.duration,
      resolution: intent.resolution,
      negativePrompt: intent.negativePrompt,
      imageUrl,
      endImageUrl: intent.endImageUrl,
      seed,
      camera: intent.camera,
    })
  }
  return buildWanPayload({
    mode: 'text',
    prompt: scene,
    durationSec: intent.duration,
    aspectRatio: intent.aspectRatio,
    resolution: intent.resolution,
    negativePrompt: intent.negativePrompt,
    seed,
    camera: intent.camera,
  })
}

function sealHailuoPayload(
  falModelId: string,
  payload: Record<string, unknown>,
  intent: FalVideoIntent,
  identity: ShotIdentity,
): Record<string, unknown> {
  const kind = falModelId === HAILUO_PRO_TEXT || falModelId === HAILUO_23_PRO_TEXT
    ? 'pro_text'
    : falModelId === HAILUO_23_STANDARD_TEXT
      ? 'standard_text'
      : falModelId === HAILUO_FAST_IMAGE
        ? 'fast_image'
        : falModelId === HAILUO_23_STANDARD_IMAGE
          ? 'standard_image'
          : falModelId === HAILUO_PRO_IMAGE || falModelId === HAILUO_23_PRO_IMAGE
            ? 'pro_image'
            : null
  if (!kind) return payload
  const scene = identity.prompt.trim() || (typeof payload.prompt === 'string' ? payload.prompt : intent.prompt)
  const imageUrl = intent.imageUrl?.trim()
    || (typeof payload.image_url === 'string' ? payload.image_url : undefined)
  return buildHailuoPayload({
    kind,
    prompt: scene,
    durationSec: intent.duration,
    imageUrl,
    endImageUrl: falModelId === HAILUO_PRO_IMAGE ? intent.endImageUrl : undefined,
    camera: intent.camera,
  })
}

function sealWan30Payload(
  falModelId: string,
  payload: Record<string, unknown>,
  intent: FalVideoIntent,
  identity: ShotIdentity,
): Record<string, unknown> {
  const wan30 = falModelId === WAN30_TEXT || falModelId === WAN30_IMAGE || falModelId === WAN30_REFERENCE
  if (!wan30) return payload
  const scene = identity.prompt.trim() || (typeof payload.prompt === 'string' ? payload.prompt : intent.prompt)
  const seed = identity.seed
  if (falModelId === WAN30_REFERENCE) {
    return buildWan30Payload({
      mode: 'reference',
      prompt: scene,
      durationSec: intent.duration,
      aspectRatio: intent.aspectRatio,
      resolution: intent.resolution,
      imageUrls: identity.referenceImages,
      videoUrls: intent.referenceVideos?.map((video) => video.url),
      seed,
      camera: intent.camera,
    })
  }
  if (falModelId === WAN30_IMAGE) {
    const imageUrl = intent.imageUrl?.trim()
      || (typeof payload.start_image_url === 'string' ? payload.start_image_url : undefined)
      || (typeof payload.image_url === 'string' ? payload.image_url : undefined)
    return buildWan30Payload({
      mode: intent.endImageUrl?.trim() ? 'first_last' : 'first_frame',
      prompt: scene,
      durationSec: intent.duration,
      aspectRatio: intent.aspectRatio,
      resolution: intent.resolution,
      imageUrl,
      endImageUrl: intent.endImageUrl,
      seed,
      camera: intent.camera,
    })
  }
  return buildWan30Payload({
    mode: 'text',
    prompt: scene,
    durationSec: intent.duration,
    aspectRatio: intent.aspectRatio,
    resolution: intent.resolution,
    seed,
    camera: intent.camera,
  })
}

function sealGrokPayload(
  falModelId: string,
  payload: Record<string, unknown>,
  intent: FalVideoIntent,
  identity: ShotIdentity,
): Record<string, unknown> {
  const grok = falModelId === GROK_V15_TEXT || falModelId === GROK_V15_IMAGE || falModelId === GROK_V15_REFERENCE
  if (!grok) return payload
  const scene = identity.prompt.trim() || (typeof payload.prompt === 'string' ? payload.prompt : intent.prompt)
  if (falModelId === GROK_V15_REFERENCE) {
    const named = (identity.namedRefs ?? []).filter((ref) => ref.url.trim())
    const urls = named.length ? named.map((ref) => ref.url) : identity.referenceImages
    return buildGrokPayload({
      mode: 'reference',
      prompt: scene,
      durationSec: intent.duration,
      aspectRatio: intent.aspectRatio,
      resolution: intent.resolution,
      imageUrls: urls,
      names: named.map((ref) => ref.name),
      camera: intent.camera,
    })
  }
  if (falModelId === GROK_V15_IMAGE) {
    const imageUrl = intent.imageUrl?.trim()
      || (typeof payload.image_url === 'string' ? payload.image_url : undefined)
      || identity.imageUrl
    return buildGrokPayload({
      mode: 'first_frame',
      prompt: scene,
      durationSec: intent.duration,
      resolution: intent.resolution,
      imageUrl,
      camera: intent.camera,
    })
  }
  return buildGrokPayload({
    mode: 'text',
    prompt: scene,
    durationSec: intent.duration,
    aspectRatio: intent.aspectRatio,
    resolution: intent.resolution,
    camera: intent.camera,
  })
}

function sealPixversePayload(
  falModelId: string,
  payload: Record<string, unknown>,
  intent: FalVideoIntent,
  identity: ShotIdentity,
): Record<string, unknown> {
  const kind = falModelId === PIXVERSE_V56_TEXT
    ? 'v56_text'
    : falModelId === PIXVERSE_V56_IMAGE
      ? 'v56_image'
      : falModelId === PIXVERSE_V56_TRANSITION
        ? 'v56_transition'
        : falModelId === PIXVERSE_V55_TEXT
          ? 'v55_text'
          : falModelId === PIXVERSE_V55_IMAGE
            ? 'v55_image'
            : falModelId === PIXVERSE_V45_TEXT
              ? 'v45_text'
              : falModelId === PIXVERSE_V4_IMAGE
                ? 'v4_image'
                : null
  if (!kind) return payload
  const scene = identity.prompt.trim() || (typeof payload.prompt === 'string' ? payload.prompt : intent.prompt)
  const imageUrl = intent.imageUrl?.trim()
    || (typeof payload.image_url === 'string' ? payload.image_url : undefined)
    || (typeof payload.first_image_url === 'string' ? payload.first_image_url : undefined)
    || identity.imageUrl
  return buildPixversePayload({
    kind,
    prompt: scene,
    durationSec: intent.duration,
    aspectRatio: intent.aspectRatio,
    resolution: intent.resolution,
    imageUrl,
    endImageUrl: intent.endImageUrl,
    negativePrompt: intent.negativePrompt,
    seed: identity.seed,
    camera: intent.camera,
  })
}

function sealHappyHorsePayload(
  falModelId: string,
  payload: Record<string, unknown>,
  intent: FalVideoIntent,
  identity: ShotIdentity,
): Record<string, unknown> {
  const kind = falModelId === HAPPYHORSE_TEXT
    ? 'text'
    : falModelId === HAPPYHORSE_IMAGE
      ? 'first_frame'
      : falModelId === HAPPYHORSE_REFERENCE
        ? 'reference'
        : falModelId === HAPPYHORSE_EDIT
          ? 'video_edit'
          : null
  if (!kind) return payload
  const scene = identity.prompt.trim() || (typeof payload.prompt === 'string' ? payload.prompt : intent.prompt)
  const named = (identity.namedRefs ?? []).filter((ref) => ref.url.trim())
  const imageUrls = named.length ? named.map((ref) => ref.url) : identity.referenceImages
  if (kind === 'reference') {
    return buildHappyHorsePayload({
      kind,
      prompt: scene,
      durationSec: intent.duration,
      aspectRatio: intent.aspectRatio,
      resolution: intent.resolution,
      imageUrls,
      names: named.map((ref) => ref.name),
      seed: identity.seed,
      camera: intent.camera,
    })
  }
  if (kind === 'video_edit') {
    const videoUrl = typeof payload.video_url === 'string' ? payload.video_url : undefined
    return buildHappyHorsePayload({
      kind,
      prompt: scene,
      resolution: intent.resolution,
      imageUrls,
      videoUrl,
      seed: identity.seed,
      camera: intent.camera,
    })
  }
  const imageUrl = intent.imageUrl?.trim()
    || (typeof payload.image_url === 'string' ? payload.image_url : undefined)
    || identity.imageUrl
  return buildHappyHorsePayload({
    kind,
    prompt: scene,
    durationSec: intent.duration,
    aspectRatio: intent.aspectRatio,
    resolution: intent.resolution,
    imageUrl: kind === 'text' ? undefined : imageUrl,
    seed: identity.seed,
    camera: intent.camera,
  })
}

function sealLtxPayload(
  falModelId: string,
  payload: Record<string, unknown>,
  intent: FalVideoIntent,
  identity: ShotIdentity,
): Record<string, unknown> {
  const kind = falModelId === LTX_FAST_TEXT
    ? 'fast_text'
    : falModelId === LTX_TEXT
      ? 'text'
      : falModelId === LTX_FAST_IMAGE
        ? 'fast_image'
        : falModelId === LTX_IMAGE
          ? 'image'
          : null
  if (!kind) return payload
  const scene = identity.prompt.trim() || (typeof payload.prompt === 'string' ? payload.prompt : intent.prompt)
  const imageUrl = intent.imageUrl?.trim()
    || (typeof payload.image_url === 'string' ? payload.image_url : undefined)
    || identity.imageUrl
  return buildLtxPayload({
    kind,
    prompt: scene,
    durationSec: intent.duration,
    aspectRatio: intent.aspectRatio,
    resolution: intent.resolution,
    imageUrl,
    endImageUrl: intent.endImageUrl,
    camera: intent.camera,
  })
}

function sealOmniPayload(
  falModelId: string,
  payload: Record<string, unknown>,
  intent: FalVideoIntent,
  identity: ShotIdentity,
): Record<string, unknown> {
  const omni = falModelId === OMNI_TEXT
    || falModelId === OMNI_IMAGE
    || falModelId === OMNI_REFERENCE
    || falModelId === OMNI_EDIT
  if (!omni) return payload
  const scene = identity.prompt.trim() || (typeof payload.prompt === 'string' ? payload.prompt : intent.prompt)
  if (falModelId === OMNI_EDIT) {
    const videoUrl = intent.videoUrl?.trim()
      || (typeof payload.video_url === 'string' ? payload.video_url : undefined)
    return buildOmniPayload({
      mode: 'video_edit',
      prompt: scene,
      resolution: intent.resolution,
      videoUrl,
      camera: intent.camera,
    })
  }
  if (falModelId === OMNI_REFERENCE) {
    const named = (identity.namedRefs ?? []).filter((ref) => ref.url.trim())
    const fromIntent = (intent.referenceImages ?? []).map((ref) => ref.url)
    const imageUrls = named.length
      ? named.map((ref) => ref.url)
      : [...identity.referenceImages, ...fromIntent]
    const names = named.length
      ? named.map((ref) => ref.name)
      : (intent.referenceImages ?? []).map((ref) => ref.label ?? '')
    const videoUrls = (intent.referenceVideos ?? []).map((ref) => ref.url)
    return buildOmniPayload({
      mode: 'reference',
      prompt: scene,
      durationSec: intent.duration,
      aspectRatio: intent.aspectRatio,
      resolution: intent.resolution,
      imageUrls,
      names,
      videoUrls,
      camera: intent.camera,
    })
  }
  if (falModelId === OMNI_IMAGE) {
    const imageUrl = intent.imageUrl?.trim()
      || (typeof payload.image_url === 'string' ? payload.image_url : undefined)
      || identity.imageUrl
    return buildOmniPayload({
      mode: intent.endImageUrl?.trim() ? 'first_last' : 'first_frame',
      prompt: scene,
      durationSec: intent.duration,
      aspectRatio: intent.aspectRatio,
      resolution: intent.resolution,
      imageUrl,
      endImageUrl: intent.endImageUrl,
      camera: intent.camera,
    })
  }
  return buildOmniPayload({
    mode: 'text',
    prompt: scene,
    durationSec: intent.duration,
    aspectRatio: intent.aspectRatio,
    resolution: intent.resolution,
    camera: intent.camera,
  })
}

function applyLtxNumFrames(
  falModelId: string,
  intent: FalVideoIntent,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!falModelId.includes('ltx-2-19b')) return payload
  const { duration: _d, ...rest } = payload
  return {
    ...rest,
    num_frames: Math.min(Math.max(Math.round(intent.duration * 25), 49), 250),
  }
}

function isSeedanceEndpoint(falModelId: string): boolean {
  return falModelId.includes('seedance')
}

function seedanceModeOf(falModelId: string, intent: FalVideoIntent): 'text' | 'first_frame' | 'first_last' | 'reference' | null {
  if (!isSeedanceEndpoint(falModelId)) return null
  if (falModelId.includes('reference-to-video')) return 'reference'
  if (falModelId.includes('image-to-video')) return intent.endImageUrl?.trim() ? 'first_last' : 'first_frame'
  return 'text'
}

function compositionFromIdentity(intent: FalVideoIntent, identity: ShotIdentity): SeedanceComposition {
  const candidates: SeedanceCandidate[] = []
  const named = identity.namedRefs ?? []
  if (named.length) {
    let primaryTaken = false
    for (const ref of named) {
      const primary = ref.kind === 'character' && !primaryTaken
      if (primary) primaryTaken = true
      candidates.push({
        url: ref.url,
        label: ref.name,
        bucket: 'image',
        role: ref.kind === 'location' ? 'location' : 'character',
        primary,
      })
    }
  }
  for (const ref of intent.referenceImages ?? []) {
    candidates.push({
      url: ref.url,
      label: ref.label,
      bucket: 'image',
      role: ref.role,
      primary: ref.primary === true || (ref.role === 'character' && !candidates.some((item) => item.primary)),
    })
  }
  for (const video of intent.referenceVideos ?? []) {
    candidates.push({
      url: video.url,
      label: video.label,
      bucket: 'video',
      role: video.role ?? 'motion_ref',
    })
  }
  for (const audio of intent.referenceAudios ?? []) {
    candidates.push({
      url: audio.url,
      label: audio.label,
      bucket: 'audio',
      role: audio.role ?? 'dialogue',
    })
  }
  return selectReferences(candidates)
}

function sealSeedancePayload(
  falModelId: string,
  payload: Record<string, unknown>,
  intent: FalVideoIntent,
  identity: ShotIdentity,
): Record<string, unknown> {
  const mode = seedanceModeOf(falModelId, intent)
  if (!mode) return payload
  const scene = identity.prompt.trim() || (typeof payload.prompt === 'string' ? payload.prompt : intent.prompt)
  if (mode === 'reference') {
    return buildSeedancePayload({
      mode,
      prompt: scene,
      durationSec: intent.duration,
      resolution: intent.resolution,
      aspectRatio: intent.aspectRatio,
      camera: intent.camera,
      composition: compositionFromIdentity(intent, identity),
    })
  }
  const imageUrl = intent.imageUrl?.trim()
    || (typeof payload.image_url === 'string' ? payload.image_url : undefined)
    || identity.imageUrl
  return buildSeedancePayload({
    mode,
    prompt: scene,
    durationSec: intent.duration,
    imageUrl,
    endImageUrl: intent.endImageUrl,
    resolution: intent.resolution,
    aspectRatio: intent.aspectRatio,
    camera: intent.camera,
  })
}

function applyGrokExtras(
  falModelId: string,
  intent: FalVideoIntent,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!falModelId.includes('grok-imagine-video')) return payload
  const duration = Math.min(15, Math.max(1, Math.round(intent.duration)))
  return { ...payload, duration }
}

function applyWanExtras(
  falModelId: string,
  intent: FalVideoIntent,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!falModelId.includes('wan/v2.7')) return payload
  const max = falModelId.includes('reference-to-video') ? 10 : 15
  const duration = Math.min(max, Math.max(2, Math.round(intent.duration)))
  return { ...payload, duration, resolution: '720p' }
}

function applyEndFrame(
  falModelId: string,
  intent: FalVideoIntent,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (falModelId.includes('reference-to-video')) {
    delete payload.end_image_url
    return payload
  }
  if (!intent.endImageUrl) return payload
  if (falModelId.includes('kling-video')) return payload
  const accepts =
    falModelId === 'bytedance/seedance-2.0/image-to-video' ||
    falModelId === falEndpoint('wan/v2.7/image-to-video') ||
    falModelId.includes('ltx-2.3/image-to-video') ||
    falModelId === OMNI_IMAGE
  if (!accepts) return payload
  return { ...payload, end_image_url: intent.endImageUrl }
}

function applyPixverseExtras(
  falModelId: string,
  _intent: FalVideoIntent,
  payload: Record<string, unknown>,
): Record<string, unknown> {
  if (!falModelId.includes('pixverse/')) return payload
  const out = { ...payload }
  if (falModelId.includes('v5.5') && out.generate_audio_switch == null) {
    out.generate_audio_switch = false
  }
  return out
}

function applyShotIdentity(
  falModelId: string,
  payload: Record<string, unknown>,
  intent: FalVideoIntent,
  identity: ShotIdentity,
): void {
  const anchor = intent.imageUrl?.trim() || undefined
  const isReferenceEndpoint = falModelId.includes('reference-to-video')
  if (isReferenceEndpoint && identity.referenceImages.length) {
    const urls = [...identity.referenceImages]
    if (anchor && !urls.includes(anchor)) urls.unshift(anchor)
    const cap = falModelId.includes('grok-imagine-video') ? 7 : falModelId.includes('veo3.1') ? 3 : falModelId.includes('wan/v2.7') ? 4 : falModelId.includes('gemini-omni-flash') ? 10 : 9
    const field = falModelId.includes('grok-imagine-video') || falModelId.includes('wan/v2.7') ? 'reference_image_urls' : 'image_urls'
    const images = urls.slice(0, cap)
    payload[field] = images
    delete payload.image_url
    delete payload.image_urls
    delete payload.reference_image_urls
    delete payload.reference_images
    payload[field] = images
    payload.prompt = identity.prompt
    if (falModelId.includes('veo3.1/reference-to-video')) payload.duration = '8s'
    if (identity.seed != null) payload.seed = identity.seed
    return
  }

  payload.prompt = identity.prompt
  if (identity.seed != null) payload.seed = identity.seed
  if (falModelId.includes('kling-video') && identity.referenceImages.length && (payload.start_image_url || anchor)) {
    const refs = identity.referenceImages.slice(0, 3)
    const frontal = refs[0]
    if (frontal) {
      payload.elements = [{
        frontal_image_url: frontal,
        ...(refs.length > 1 ? { reference_image_urls: refs.slice(1) } : {}),
      }]
    }
  } else if (identity.referenceImages.length && !falModelId.includes('kling-video')) {
    payload.reference_images = identity.referenceImages
  }
  if (identity.supportsCharRef && anchor) payload.image_url = anchor
  if (!identity.supportsCharRef && identity.imageUrl && !payload.image_url && !anchor) {
    payload.image_url = identity.imageUrl
  }
}

function missingPrompt(shotIndex?: number): PayloadError {
  return new PayloadError(shotIndex == null ? 'shot has no prompt' : `shot ${shotIndex} has no prompt`)
}

function sealPromptText(text: string, max: number | undefined, keepTail?: string): string {
  const trimmed = text.trim()
  if (!max || trimmed.length <= max) return trimmed
  if (keepTail && trimmed.endsWith(keepTail) && keepTail.length < max) {
    const head = capPromptText(trimmed.slice(0, trimmed.length - keepTail.length), max - keepTail.length)
    return `${head}${keepTail}`
  }
  return capPromptText(trimmed, max)
}

async function sealSubmittedPrompt(
  falModelId: string,
  payload: Record<string, unknown>,
  shotIndex?: number,
): Promise<void> {
  const stored = await getConstraints(falModelId).catch((err) => {
    console.warn("[caught] src/lib/fal/videoPayloadAdapters.ts:955", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (null)
  })
  const max = promptCharLimit(stored, falModelId)
  let text = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  const elementCount = falModelId.includes('kling-video') && Array.isArray(payload.elements)
    ? payload.elements.length
    : 0
  if (elementCount > 0) {
    const tags = Array.from({ length: elementCount }, (_, index) => `@Element${index + 1}`)
    const missing = tags.filter((tag) => !text.includes(tag))
    if (missing.length) text = `${text} ${missing.join(' ')}`.trim()
  }
  const elementTail = text.match(/(?: @Element\d+)+$/)?.[0]
  const referenceTail = text.match(/ Visual reference: @Image\d+(?: through @Image\d+)?\.$/)?.[0]
  if (!text) throw missingPrompt(shotIndex)
  const fitted = sealPromptText(text, max, elementTail ?? referenceTail)
  if (fitted.length !== text.length) {
    falLog('info', 'prompt_truncated', { endpoint: falModelId, original: text.length, final: fitted.length })
  }
  if (!fitted) throw missingPrompt(shotIndex)
  payload.prompt = fitted
}

async function assembleFamilyPayload(
  falModelId: string,
  registryKey: string,
  intent: FalVideoIntent,
  prepared?: ShotIdentity,
): Promise<Record<string, unknown>> {
  const identity = prepared ?? await conditionShotIdentity({
    prompt: intent?.prompt ?? '',
    endpoint: falModelId,
    registryKey,
    characterIds: intent.characterIds,
    locationId: intent.locationId,
    projectId: intent.projectId,
    anchorFrameUrl: intent.imageUrl,
    camera: intent.camera,
    genrePresetId: intent.genrePresetId,
  })
  const composed = identity.prompt.trim()
  if (!composed) throw missingPrompt(intent.shotIndex)

  falModelId = ensureKlingTier(falModelId)
  const duration = falModelId.includes('ltx-2.3')
    ? snapLtx23Duration(intent.duration, falModelId)
    : falModelId.includes('kling-video')
      ? Number(klingDurationForEndpoint(falModelId, intent.duration))
      : falModelId.includes('/wan/')
        ? wanDuration(intent.duration, falModelId.includes('reference-to-video'))
        : intent.duration
  intent = { ...intent, prompt: composed, duration }
  let payload = await assemblePayload(falModelId, intentToShot(intent))

  if (falModelId.includes('kling-video')) {
    payload = applyKlingExtras(falModelId, intent, payload)
  }
  payload = applyLtxNumFrames(falModelId, intent, payload)
  payload = isSeedanceEndpoint(falModelId)
    ? (() => {
        const next = { ...payload }
        delete next.prompt_optimizer
        delete next.seed
        return next
      })()
    : payload
  payload = applyGrokExtras(falModelId, intent, payload)
  payload = applyWanExtras(falModelId, intent, payload)
  payload = applyPixverseExtras(falModelId, intent, payload)
  payload = applyHappyHorseText(falModelId, payload)
  payload = applyEndFrame(falModelId, intent, payload)

  applyShotIdentity(falModelId, payload, intent, identity)
  payload = sealSeedancePayload(falModelId, payload, intent, identity)
  payload = sealKlingPayload(falModelId, payload, intent, identity)
  payload = sealVeoPayload(falModelId, payload, intent, identity)
  payload = sealWanPayload(falModelId, payload, intent, identity)
  payload = sealHailuoPayload(falModelId, payload, intent, identity)
  payload = sealWan30Payload(falModelId, payload, intent, identity)
  payload = sealGrokPayload(falModelId, payload, intent, identity)
  payload = sealPixversePayload(falModelId, payload, intent, identity)
  payload = sealHappyHorsePayload(falModelId, payload, intent, identity)
  payload = sealLtxPayload(falModelId, payload, intent, identity)
  payload = sealOmniPayload(falModelId, payload, intent, identity)
  await sealSubmittedPrompt(falModelId, payload, intent.shotIndex)

  assertRequiredPayloadFields(falModelId, payload)
  if (intent.extraFields) Object.assign(payload, intent.extraFields)
  return payload
}

/** Build payload + retry once after 422 schema refresh (self-heal). */
export async function buildPayloadWithHeal(
  falModelId: string,
  registryKey: string,
  intent: FalVideoIntent,
  submitError?: unknown,
): Promise<Record<string, unknown>> {
  if (submitError instanceof FalValidationError) {
    await forceRefreshConstraints(falModelId)
  }
  return assembleFamilyPayload(falModelId, registryKey, intent)
}

export { assembleFamilyPayload as buildPayload }

/** Runtime guard — catches missing required keys before FAL submit. */
export function assertRequiredPayloadFields(
  falModelId: string,
  payload: Record<string, unknown>,
): void {
  if (!falModelId.includes('text-to-video') && !falModelId.includes('image-to-video')
    && !falModelId.includes('dream-machine') && !falModelId.includes('luma/ray')
    && !falModelId.includes('gemini-omni-flash')) {
    return
  }
  if (!('prompt' in payload)) {
    throw new Error(`Payload for ${falModelId} missing required field: prompt`)
  }
  const p = payload.prompt
  if (typeof p !== 'string' || p.trim().length < 3) {
    throw new Error(`Payload for ${falModelId} has empty prompt`)
  }
  if (falModelId.includes('image-to-video') && !('image_url' in payload)) {
    if (falModelId.includes('luma') || falModelId.includes('gemini-omni-flash')) {
      throw new Error(`Payload for ${falModelId} missing required field: image_url`)
    }
  }
  if (falModelId === OMNI_EDIT && !('video_url' in payload)) {
    throw new Error(`Payload for ${falModelId} missing required field: video_url`)
  }
}
