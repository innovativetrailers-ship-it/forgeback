export const MOCAP_DRAW_MODES = ['body-pose', 'full-pose', 'face-pose', 'hand-pose'] as const
export type MocapDrawMode = (typeof MOCAP_DRAW_MODES)[number]

export const MOCAP_RESOLUTIONS = ['480p', '580p', '720p'] as const
export type MocapResolution = (typeof MOCAP_RESOLUTIONS)[number]

export const ANIME_STYLES = ['shonen', 'seinen', 'cell_shade'] as const
export type AnimeStyle = (typeof ANIME_STYLES)[number]

export type FccRotoMode = 'character' | 'vfx_only' | 'aura'

export interface ChoreographySegment {
  startSec: number
  endSec: number
  motion: string
  cameraAngle: string
  bodyPart: string
  intensity: number
}

export interface ChoreographyPlan {
  segments: ChoreographySegment[]
}

export interface FccMocapRequest {
  motionVideoUrl: string
  drawMode?: MocapDrawMode
  resolution?: MocapResolution
  strength?: number
  prompt?: string
}

export interface FccAnimeRequest {
  videoUrl: string
  style: AnimeStyle
}

export interface FccRotoRequest {
  videoUrl: string
  mode: FccRotoMode
}

export const MOCAP_BASE_CREDITS = 18
export const ANIME_TRANSFORM_CREDITS = 15
export const ROTO_OVERLAY_CREDITS = 20

export function clampMocapStrength(strength: number | undefined): number {
  if (strength == null || Number.isNaN(strength)) return 0.85
  return Math.min(1, Math.max(0.01, strength))
}

export function buildMocapPrompt(portraitLabel: string, userPrompt?: string): string {
  const label = (portraitLabel ?? 'character').replace(/\.[^.]+$/, '')
  const extra = (userPrompt ?? '').trim()
  const base = `Photorealistic ${label}, full-body character animation matching the reference skeleton motion, stable identity, cinematic lighting, natural movement`
  return extra ? `${base}. ${extra}` : base
}
