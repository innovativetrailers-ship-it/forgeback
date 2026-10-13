// src/lib/orchestration/types.ts

import type { CompiledFilm, ProductionBreakdown, ShotPurpose } from '@cinema/core'

// Unified sub-progress callback — every vendor poller calls this
export interface SubProgress {
  pct:     number   // 0-100 within this single segment
  message: string   // human-readable status
  vendor:  string   // 'fal' | 'runway' | 'xai' | 'suno' | 'elevenlabs'
}

export type SubProgressFn = (p: SubProgress) => void

export type ContentType =
  | 'aerial_establishing'    // wide aerial, environments → Luma
  | 'dialogue_closeup'       // faces, dialogue, lip sync → Seedance
  | 'physical_action'        // locomotion, combat, sports → Kling
  | 'cgi_vfx'               // particles, fire, fluid sim → PixVerse C1
  | 'crowd_urban'            // multi-person, cityscape → HunyuanVideo
  | 'camera_control'         // complex moves, keyframes → Runway
  | 'physics_simulation'     // water, cloth, impact → Veo 3.1
  | 'character_emotion'      // micro-expressions, reaction → Minimax
  | 'cgi_character'          // 3D animation, walk cycles → HY-Motion
  | 'long_sequence'          // >15s continuous → SkyReels V3
  | 'fast_draft'             // pre-vis, speed check → LTX Fast
  | 'environment_travel'     // landscape, nature → Wan 2.2
  | 'product_commercial'     // product shots → Pika 2.5
  | 'audio_native'           // dialogue/audio shot — visual via council; audio via ElevenLabs post

export interface PatientZeroAssets {
  characters: Array<{
    name:       string
    imageUrl:   string    // R2 URL of high-res reference
    embedUrl:   string    // same, used as IP-Adapter input
  }>
  locations: Array<{
    name:       string
    imageUrl:   string
  }>
}

export const SHOT_TRANSITION_KINDS = ['cut', 'dissolve', 'fade-in', 'fade-out', 'match', 'flash', 'generative-bridge'] as const
export type ShotTransitionKind = (typeof SHOT_TRANSITION_KINDS)[number]

export interface ShotTransition {
  kind: ShotTransitionKind
  durationMs?: number
}

export interface StructuredShot {
  id?:               string
  shotIndex:         number
  startSeconds:      number
  endSeconds:        number
  duration:          number
  contentType:       ContentType
  visualPrompt:      string
  cameraMove:        string
  cameraAngle?:      string
  shotSize?:         string
  lensFeel?:         string
  cameraSpeed?:      string
  cameraPrecision?:  boolean
  motionLevel:       'static' | 'slow' | 'medium' | 'fast' | 'complex'
  hasDialogue:       boolean
  hasFaces:          boolean
  hasAudio:          boolean
  hasCGI:            boolean
  charactersPresent: string[]
  locationsPresent:  string[]
  lighting:          string
  mood:              string
  bridgeRequired:    boolean
  suggestedModel?:   string
  modelOverride?:    string | null
  moneyShot?:        boolean
  consistencyNeed?:  number
  cameraNeed?:       number
  budget?:           number
  delegationReason?: string
  delegatedMode?:    string

  sceneNumber?:      number   // narrative scene (sequential across film)
  scriptBeatId?:     string   // links to script beat for dialogue extraction
  // Continuity grouping (legacy; sceneNumber drives sequential scheduling)
  continuityGroup:   number
  isChainStart:      boolean  // true only for first clip of the entire film
  startsAtHardCut?:  boolean
  storyboardUrl?:    string
  /** Premise element ids this shot serves. `story` means the locked action. */
  premiseElementIds?: string[]
  /** What the shot is for. Delegation reads this later. */
  purpose?:          ShotPurpose
  /** Previous shot id (`shot-<index>`) when this shot takes that shot's video as reference. */
  chainFrom?:        string | null
  /** Brain decision. `continuous` feeds the previous shot's video. `cut` starts fresh. */
  continuity?:       'continuous' | 'cut'
  /** Edit into this shot. A cut is two clips, never a morph inside one generation. */
  transition?:       ShotTransition
  chainLink?:        'video' | 'still' | 'none'
  continuityPriority?: 'low' | 'normal'
  isCut?:            boolean
  playbookFragment?: string
  genrePresetId?:    string | null
  aspectRatio?:      string
}

/** Internal clip for sequential chain dispatch. */
export interface ChainedClip {
  id:             string
  sceneId:        string
  sceneNumber:    number
  shotNumber:     number
  prompt:         string
  duration:       number
  aspectRatio:    string
  assignedModel:  string
  resolution?:    '480p' | '720p' | '1080p'
  keyframeUrl?:   string
  anchorPolicy:   AnchorPolicy
  startFrameUrl?: string
  scriptBeatId?:  string
  shotIndex:      number
  contentType:    ContentType
  visualPrompt:   string
  hasDialogue:    boolean
  hasFaces:       boolean
  charactersPresent: string[]
  lighting:       string
}

export type AnchorPolicy = 'previous-frame' | 'keyframe' | 'none'

// A chain is a sequential run of continuous shots; chains run in parallel
export interface ContinuityChain {
  groupId: number
  shots:   StructuredShot[]   // ordered within the chain
}

export interface DAGNode {
  shot:           StructuredShot
  assignedModel:  string
  dependencies:   number[]
  tailFrameUrl?:  string
  shotMemory:     string[]
  estimatedCost:  number
  priority:       'critical' | 'high' | 'normal'
  reason?:        string
}

export interface GeneratedSegment {
  shotIndex:    number
  shotId?:      string
  videoUrl:     string
  /** Durable playback path for the mirrored file. Chain feed uses this, not the provider CDN. */
  mediaPath?:   string
  duration:     number
  model:        string
  contentType:  ContentType  // carried through so the learning loop can attribute reward per content type
  tailFrameUrl: string
  qualityScore: number
  retryCount:   number
}

export interface OrchestrationResult {
  segments:       GeneratedSegment[]
  finalVideoUrl:  string
  totalCredits:   number
  totalDuration:  number
  qualityScores:  Record<number, number>
  modelBreakdown: Record<string, { duration: number; cost: number; shots: number[] }>
  patientZero:    PatientZeroAssets
  /** Shots and assignments from the one planner. Present on plan-only runs. */
  plannedShots?:  StructuredShot[]
  productionBreakdown?: ProductionBreakdown
  compiledPlan?: CompiledFilm
}
