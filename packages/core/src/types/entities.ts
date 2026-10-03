export interface ProjectSettings {
  aspectRatio: '16:9' | '9:16' | '1:1' | '2.39:1' | '4:5'
  fps: 24 | 30 | 60
  resolution: '720p' | '1080p' | '4k'
  qualityTier: 'draft' | 'studio' | 'blockbuster'
  colorSpace: 'rec709' | 'p3' | 'rec2020'
}

export interface Project {
  id: string
  title: string
  createdAt: number
  updatedAt: number
  settings: ProjectSettings
}

export interface IntentModel {
  goal?: string
}

export interface EmotionalArc {
  label?: string
}

export interface CreativeBrief {
  rawPrompt: string
  enrichedPrompt: string
  intent?: IntentModel
  emotionalArc?: EmotionalArc
  styleKey: 'cinematic' | 'documentary' | 'commercial' | 'animation' | 'news'
  references: string[]
}

export interface Scene {
  id: string
  projectId: string
  order: number
  brief: CreativeBrief
}

export type ShotStatus = 'pending' | 'awaiting_direction' | 'generating' | 'completed' | 'failed'
export type AnchorSource = 'auto' | 'manual' | 'keyframe' | 'generated' | 'none'

export interface Shot {
  id: string
  sceneId: string
  projectId: string
  order: number
  prompt: string
  status: ShotStatus
  selectedModelId: string
  provider: import('./provider').Provider
  modelOverride: boolean
  anchorFrameUrl: string | null
  anchorSource: AnchorSource
  characterIds: string[]
  locationId: string | null
  videoUrl: string | null
  sourceProviderUrl: string | null
  lastFrame: string | null
  durationSec: number | null
  falRequestId: string | null
  qualityScore: number | null
  continuityGroupId: string | null
  createdAt: number
  updatedAt: number
}

export interface Character {
  id: string
  projectId: string
  name: string
  referenceImageUrl: string
  seed: number | null
  voiceId: string | null
  descriptor: string
  wardrobe: string | null
}

export interface Location {
  id: string
  projectId: string
  label: string
  plateUrl: string
  coords: { lat: number; lng: number } | null
}

export type TrackKind = 'video' | 'vfx' | 'cgi' | 'music' | 'voice' | 'sfx' | 'title'

export interface Clip {
  id: string
  shotId: string | null
  track: TrackKind
  startSec: number
  durationSec: number
  sourceUrl: string
  posterUrl?: string
  label?: string
}

export interface AudioAsset {
  id: string
  projectId: string
  kind: 'voice' | 'music' | 'sfx'
  characterId: string | null
  url: string
  durationSec: number
  startSec: number
}
