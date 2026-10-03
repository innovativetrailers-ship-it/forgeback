export interface TimelineRecipe {
  id: string
  projectId: string
  fps: 24 | 30 | 60
  resolution: { width: number; height: number }
  durationSeconds: number
  colorSpace: 'rec709' | 'dci-p3' | 'rec2020'
  tracks: Track[]
  globalEffects?: GlobalEffect[]
  audioMixSettings?: AudioMixSettings
  colourGradeSettings?: ColourGradeSettings
  exportSettings?: ExportSettings
  /** When on, the editor plays proxyUrl. Export still uses sourceUrl. */
  editWithProxies?: boolean
  markers?: Array<{ id: string; time: number; kind: 'beat' | 'mark' }>
}

export interface Track {
  id: string
  type: 'video' | 'audio' | 'vfx' | 'caption' | 'cgi'
  label: string
  muted: boolean
  locked: boolean
  solo: boolean
  volume?: number
  clips: Clip[]
}

export interface Clip {
  id: string
  trackId: string
  startTime: number
  endTime: number
  sourceUrl: string
  proxyUrl?: string
  /** Filmstrip / timeline thumbnail — still frame only, never the playback src. */
  posterUrl?: string
  modelUsed?: string
  prompt?: string
  characterId?: string
  locationId?: string
  transition?: Transition
  effects?: ClipEffect[]
  transform?: ClipTransform
  colourGrade?: ClipColourGrade
  audioSettings?: ClipAudio
  metadata?: Record<string, unknown>
  /** Deterministic overlay, track, and post-camera. Never replaces the clip media. */
  control?: import('./controlLayer').ClipControl
  /** Typed dialogue. Optional. A shot with none stays silent. */
  dialogue?: import('../audio/dialogueIntent').DialogueLine[]
  /** Center crop for a social cut-down. The source file stays. */
  reframe?: '16:9' | '9:16' | '1:1' | '4:5'
  /** Non-destructive generative take. The parent clip stays until Accept. */
  generativeOp?: {
    type: 'fx-inpaint' | 'bridge' | 'extend'
    parentClipId: string
    engine: string
    prompt?: string
    accepted: boolean
  }
  /** Local speed curve. 100 is normal. No model call. */
  timeRemap?: {
    enabled: boolean
    keyframes: Array<{ t: number; speedPct: number }>
    motionBlur?: { amountPct: number; directionDeg: number; peakOnly: boolean }
  }
  /** A look over the clips beneath this range. Not media. */
  adjustment?: boolean
  /** This clip plays another sequence. The parent recipe id must not appear inside it. */
  nestRecipe?: TimelineRecipe
}

export interface Transition {
  type: 'cut' | 'dissolve' | 'fade' | 'fade-in' | 'fade-out' | 'match' | 'flash' | 'wipe' | 'slide' | 'push' | 'zoom' | 'whip' | 'spin' | 'glitch' | 'blur' | 'film_burn' | 'light_leak' | 'generative-bridge'
  duration: number
  direction?: 'left' | 'right' | 'up' | 'down'
}

export type ClipEffectType =
  | 'rain' | 'snow' | 'fog' | 'film_grain' | 'halation' | 'vignette'
  | 'lens_flare' | 'bloom' | 'chromatic_aberration' | 'motion_blur'
  | 'glow' | 'dust_particles' | 'lightning' | 'fire' | 'smoke'

export interface ClipEffect {
  type: ClipEffectType
  intensity: number
  params?: Record<string, number>
}

export interface ClipTransform {
  x: number
  y: number
  scale: number
  rotation: number
  opacity: number
  kenBurns?: { startRect: Rect; endRect: Rect }
}

export interface Rect {
  x: number
  y: number
  width: number
  height: number
}

export interface ClipColourGrade {
  lutUrl?: string
  lutIntensity?: number
  filmEmulation?: 'kodak_5219' | 'fuji_3510' | 'kodak_2383' | 'bw_contrast' | 'none'
  asc_cdl?: {
    lift: [number, number, number]
    gamma: [number, number, number]
    gain: [number, number, number]
    saturation: number
  }
  shadows?: number
  midtones?: number
  highlights?: number
  temperature?: number
  tint?: number
  /** Desktop colourist fields. Web renders the core grade and leaves these for desktop. */
  deep?: import('@cinema/core').DeepGrade
}

export interface ClipAudio {
  volume: number
  pan: number
  eq?: { low: number; mid: number; high: number }
  fadeIn?: number
  fadeOut?: number
}

export interface GlobalEffect {
  type: string
  intensity: number
  applyToAll: boolean
}

export interface ColourGradeSettings {
  lut?: { url: string; intensity: number }
  filmEmulation?: 'kodak_5219' | 'fuji_3510' | 'kodak_2383' | 'bw_contrast' | 'none'
  asc_cdl: {
    lift: [number, number, number]
    gamma: [number, number, number]
    gain: [number, number, number]
    saturation: number
  }
  shadows: number
  midtones: number
  highlights: number
  temperature: number
  tint: number
}

export interface AudioMixSettings {
  masterVolume: number
  masterCompressor: boolean
  spatialAudio: boolean
  tracks: Array<{
    trackId: string
    volume: number
    pan: number
    eq: { low: number; mid: number; high: number }
  }>
}

export interface ExportSettings {
  format: 'mp4_h264' | 'mp4_h265' | 'prores_422' | 'prores_4444' | 'dcp'
  resolution: { width: number; height: number }
  bitrate: number
  audioCodec: 'aac' | 'pcm' | 'ac3'
  metadata: Record<string, string>
}

export function defaultColourGrade(): ColourGradeSettings {
  return {
    asc_cdl: {
      lift: [0, 0, 0],
      gamma: [1, 1, 1],
      gain: [1, 1, 1],
      saturation: 1,
    },
    shadows: 0,
    midtones: 0,
    highlights: 0,
    temperature: 6500,
    tint: 0,
  }
}

export function defaultAudioMix(trackIds: string[]): AudioMixSettings {
  return {
    masterVolume: 100,
    masterCompressor: false,
    spatialAudio: false,
    tracks: trackIds.map((id) => ({
      trackId: id,
      volume: 100,
      pan: 0,
      eq: { low: 0, mid: 0, high: 0 },
    })),
  }
}
