export interface GenerateVideoInput {
  prompt: string
  negativePrompt?: string
  duration: number // seconds
  aspectRatio: '16:9' | '9:16' | '1:1' | '4:3' | '21:9'
  /** UI tier label or id — mapped to FAL resolution (720p/1080p) for Wan 2.6 */
  quality?: string
  startFrameUrl?: string
  endFrameUrl?: string
  characterRefs?: string[]
  loraId?: string
  cameraMotion?: string
  motionStrength?: number
  seed?: number
}

export interface GenerateVideoOutput {
  jobId: string
  videoUrl?: string
  thumbnailUrl?: string
  status: 'pending' | 'processing' | 'complete' | 'failed'
  pollUrl?: string
  error?: string
}

export type QualityTier = 'draft' | 'standard' | 'premium' | 'cinematic' | 'film' | 'film_grade'
export type SceneType =
  | 'action'
  | 'dialogue'
  | 'environment'
  | 'aerial'
  | 'cgi_heavy'
  | 'general'

export type VideoModel =
  | 'wan'
  | 'animatediff'
  | 'luma'
  | 'pika'
  | 'minimax'
  | 'kling_standard'
  | 'kling_pro'
  | 'seedance'
  | 'runway'
  | 'veo3'
  | 'svd'
  | 'skyreels'
  | 'ltx'
  | 'pixverse'
  | 'hunyuan'
  | 'happyhorse'
  | 'hailuo'
  | 'grok_video'
  | 'sora'

export interface ModelRouterInput {
  quality: QualityTier
  sceneType?: SceneType
  hasCharacterRef: boolean
  hasLoRA: boolean
  duration: number
  userRole: string
  budget?: 'low' | 'medium' | 'high'
}

export interface ProcessingInput {
  videoUrl: string
  type:
    | 'relight'
    | 'upscale'
    | 'face_restore'
    | 'remove_bg'
    | 'depth_map'
    | 'lipsync'
    | 'transcribe'
}

export interface AudioInput {
  type: 'music' | 'speech' | 'foley'
  prompt?: string
  duration?: number
  voice?: string
  text?: string
  style?: string
}

export interface TimelineClip {
  id: string
  trackId: string
  startTime: number
  duration: number
  sourceUrl: string
  proxyUrl?: string
  type: 'video' | 'audio' | 'image' | 'text'
  metadata?: Record<string, unknown>
  effects?: ClipEffect[]
  transition?: Transition
}

export interface ClipEffect {
  type: string
  params: Record<string, unknown>
}

export interface Transition {
  type: string
  duration: number
}

export interface Track {
  id: string
  type: 'video' | 'audio' | 'fx'
  name: string
  clips: TimelineClip[]
  muted?: boolean
  locked?: boolean
  volume?: number
}

export interface TimelineRecipe {
  id: string
  fps: number
  resolution: string
  durationSeconds: number
  tracks: Track[]
  audioMixSettings?: Record<string, unknown>
  colorGradeSettings?: Record<string, unknown>
}
