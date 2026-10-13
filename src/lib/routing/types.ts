// Re-export swarm types under the canonical routing namespace
export type { Shot, ShotList, ModelId, OutcomeTier, SceneCategory, SwarmResult } from '../swarm/types'

export interface SceneSegment {
  segmentId: string
  clipId: string
  shotId: string
  startSeconds: number
  endSeconds: number
  prompt: string
  engineId: string
  tier: string
  requirements: string[]
  characterIds?: string[]
  isHardCut?: boolean
  anchorStartFrameUrl?: string
  anchorEndFrameUrl?: string
  styleReferenceUrl?: string
  estimatedCredits: number
}

export interface BlendProfile {
  grain: number
  colorTemp: number
  contrast: number
  saturation: number
}
