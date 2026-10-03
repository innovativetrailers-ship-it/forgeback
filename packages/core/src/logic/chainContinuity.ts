/**
 * Chained continuity. A shot feeds the previous shot's video forward only when
 * the scene continues, the model accepts a video reference, and the shot is
 * worth the sequential wait.
 * Wan 3.0 reference-to-video (OpenAPI 200): reference_video_urls max 5, described
 * as totaling at most 15 seconds. Duration is an integer 2-30. That input has no
 * start_image_url or end_image_url. The fed clip stays 3 seconds, inside the 15s
 * cap, and output is clamped so clip + output stays within 30.
 */

export const CHAIN_CLIP_SECONDS = 3
export const WAN30_REF_VIDEO_MAX_SECONDS = 15
export const WAN30_OUTPUT_MIN = 2
export const WAN30_OUTPUT_MAX = 30
export const CHAIN_REGEN_LIMIT = 1

/** Reference-to-video model for a continuous link. Wave 4 swaps this one line to open-weight Wan 2.2. */
export const CONTINUITY_MODEL_ID = 'wan-2.7'

export const CONTINUITY_SCORE_MIN = 0.62

export const VIDEO_REFERENCE_MODELS = [CONTINUITY_MODEL_ID, 'seedance-2.0', 'gemini-omni', 'wan-3.0'] as const

const LOW_CONTINUITY = new Set([
  'aerial_establishing',
  'environment_travel',
  'fast_draft',
  'product_commercial',
])

export type ContinuityPriority = 'low' | 'normal'
export type ChainLink = 'video' | 'still' | 'none'
export type GateMode = 'auto' | 'manual' | 'both'
export type GateDecision = 'pass' | 'regenerate' | 'await_user'

export interface ContinuityShot {
  id: string
  sceneId: string
  isCut?: boolean
  continuityPriority?: ContinuityPriority
}

export function isVideoReferenceCapable(modelId: string): boolean {
  return (VIDEO_REFERENCE_MODELS as readonly string[]).includes(modelId)
}

export function continuityPriorityFor(contentType: string | undefined): ContinuityPriority {
  return contentType && LOW_CONTINUITY.has(contentType) ? 'low' : 'normal'
}

export function shouldChain(
  shot: ContinuityShot,
  prev: ContinuityShot | null | undefined,
  model: { videoReferenceCapable: boolean },
): boolean {
  if (!prev) return false
  if (shot.isCut || shot.sceneId !== prev.sceneId) return false
  if (!model.videoReferenceCapable) return false
  if (shot.continuityPriority === 'low') return false
  return true
}

export function chainLink(
  shot: ContinuityShot,
  prev: ContinuityShot | null | undefined,
  videoReferenceCapable: boolean,
): ChainLink {
  if (!prev) return 'none'
  if (shot.isCut || shot.sceneId !== prev.sceneId) return 'none'
  if (shot.continuityPriority === 'low') return 'none'
  return videoReferenceCapable ? 'video' : 'still'
}

export type ContinuityFlag = 'continuous' | 'cut'

/** Same place and time continues. A cut, a new scene, or a location change breaks. */
export function shotContinuityFlag(args: {
  hasPrev: boolean
  sameScene: boolean
  sameLocation: boolean
  hardCut: boolean
  lowPriority: boolean
}): ContinuityFlag {
  if (!args.hasPrev || args.hardCut || !args.sameScene || !args.sameLocation || args.lowPriority) return 'cut'
  return 'continuous'
}

/** The routed model wins when it can take video. Otherwise the one config line, if it was selected. */
export function chainModelChoice(routedModel: string, selectedModels: readonly string[]): string | null {
  if (isVideoReferenceCapable(routedModel)) return routedModel
  if (selectedModels.includes(CONTINUITY_MODEL_ID)) return CONTINUITY_MODEL_ID
  if (selectedModels.includes('gemini-omni')) return 'gemini-omni'
  if (selectedModels.includes('seedance-2.0')) return 'seedance-2.0'
  return null
}

export interface ScheduledShot {
  id: string
  link: ChainLink
}

export interface ContinuityChainGroup {
  shots: ScheduledShot[]
}

export function partitionContinuity(shots: ScheduledShot[]): {
  chains: ContinuityChainGroup[]
  independents: ScheduledShot[]
} {
  const chains: ContinuityChainGroup[] = []
  const independents: ScheduledShot[] = []
  let buffer: ScheduledShot[] = []
  const flush = () => {
    if (buffer.length === 0) return
    if (buffer.length === 1 && buffer[0].link === 'none') independents.push(buffer[0])
    else chains.push({ shots: buffer })
    buffer = []
  }
  for (const shot of shots) {
    if (shot.link === 'none') {
      flush()
      buffer = [shot]
    } else {
      buffer.push(shot)
    }
  }
  flush()
  return { chains, independents }
}

/** Wan 3.0 output seconds. The 3s clip counts against the 30s clip+output budget. */
export function wanChainOutputSeconds(shotSeconds: number | undefined, clipSeconds = CHAIN_CLIP_SECONDS): number {
  if (clipSeconds > WAN30_REF_VIDEO_MAX_SECONDS) {
    throw new Error('wan 3.0 reference videos total at most 15 seconds')
  }
  const room = Math.min(WAN30_OUTPUT_MAX, WAN30_OUTPUT_MAX - clipSeconds)
  const wanted = shotSeconds == null || !Number.isFinite(shotSeconds) ? 5 : Math.round(shotSeconds)
  return Math.min(room, Math.max(WAN30_OUTPUT_MIN, wanted))
}

export function gateChainLink(
  gateMode: GateMode,
  autoPassed: boolean | null,
  regenerationsUsed: number,
): GateDecision {
  const checking = gateMode === 'auto' || gateMode === 'both'
  if (checking && autoPassed === false) {
    return regenerationsUsed < CHAIN_REGEN_LIMIT ? 'regenerate' : 'await_user'
  }
  if (gateMode === 'manual' || gateMode === 'both') return 'await_user'
  return 'pass'
}
