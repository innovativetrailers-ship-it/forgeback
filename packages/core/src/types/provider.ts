/** Video providers. Sora 2 is deprecated and is not a provider. Replicate remains only so a stray id fails closed. */
export type Provider = 'fal' | 'runway' | 'grok' | 'replicate' | 'elevenlabs' | 'suno'

/** How a shot is submitted. Families fill endpoints per mode in MP-02+. */
export type Mode = 'text' | 'first_frame' | 'first_last' | 'reference' | 'video_edit'

export interface FamilyFieldMap {
  firstFrame: string
  lastFrame?: string
  firstFrameForLast?: string
  references: { mode: 'prompt_tag' | 'array' | 'field'; tag?: '@' | '#'; field?: string; max: number }
  duration: { field: string; kind: 'string_s' | 'number' | 'frames' | 'enum' | 'range'; values?: (string | number)[]; min?: number; max?: number }
  audio: { field: string; kind: 'bool' | 'switch' | 'native_always' }
  resolution?: { field: string; values: string[] }
  aspect?: { field: string; values: string[] }
  negative?: string
  seed?: string
}

export interface ModelDef {
  id: string
  provider: Provider
  endpoint: string
  i2vEndpoint?: string
  role: string
  tier: 'draft' | 'studio' | 'blockbuster'
  costPer5s: number
  silentOnly: boolean
  pinned: boolean
  /** Registry key after alias resolution. Same as id. */
  canonicalId: string
  /** Endpoint the current web dispatch reads. Same string as endpoint. */
  falEndpoint: string | undefined
  isExternal: boolean
  /** Endpoint accepts a numeric seed for identity reuse. */
  supportsSeed: boolean
  /** Model can take character and location images distinct from the I2V anchor. */
  supportsCharRef: boolean
  /** Multi-image endpoint used when supportsCharRef and reference images exist. */
  referenceEndpoint?: string
  /** Live control surface. Camera is prompt-only for every v1 model. */
  control: ModelControlSurface
  /**
   * Per-mode FAL endpoint ids. Empty until a family prompt (MP-02+) fills them.
   * Absent means this entry has not been migrated onto the mode pipeline.
   */
  endpoints?: Partial<Record<Mode, string>>
  /** Schema field names for this family. Absent until that family is wired. */
  fields?: FamilyFieldMap
  limits?: { maxPromptChars: number }
}

export interface ModelControlSurface {
  referenceClass: 'true_reference' | 'first_frame' | 'none'
  maxReferenceImages: number
  firstLastFrame: boolean
  cameraControl: 'full' | 'presets' | 'params' | 'prompt_only'
  motionBrush: boolean
  /** The API can generate audio. Dispatch still silences every model except Grok. */
  nativeAudio: boolean
  referenceField?: 'image_urls' | 'reference_image_urls'
}

export interface GenerationResult {
  videoUrl: string
  lastFrame?: string
  durationSec?: number
  provider: Provider
  requestId: string
}

export interface ModelConstraints {
  endpoint: string
  required: string[]
  forbidden: string[]
  enums: Record<string, (string | number)[]>
  types: Record<string, 'string' | 'number' | 'boolean'>
  audioField: string | null
  schemaHash: string
  fetchedAt: number
  /** Property names from the OpenAPI input schema, when the host has them. */
  properties?: string[]
  /** OpenAPI maxLength of the prompt field for this endpoint, when known. */
  maxPromptChars?: number
}

export interface JobEvent {
  jobId: string
  type: 'progress' | 'step' | 'complete' | 'failed'
  shotId?: string
  detail: {
    videoUrl?: string
    lastFrame?: string
    durationSec?: number
  }
}
