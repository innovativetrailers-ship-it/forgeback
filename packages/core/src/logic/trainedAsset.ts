import type { Mode, ModelControlSurface, ModelDef } from '../types/provider'
import {
  LORA_INFERENCE_REGISTRY,
  TRAINER_REGISTRY,
  loraInferenceDef,
  loraMechanism,
  loraPassFor,
  type LoraInferenceDef,
  type LoraPass,
} from './trainerRegistry'
import { isCircuitOpen, type PurposeScore } from './learn'
import type { LearnedByPurpose } from './modelKnowledge'

export const TRAINED_ASSET_TYPES = ['character', 'style', 'audio_style'] as const
export type TrainedAssetType = (typeof TRAINED_ASSET_TYPES)[number]

export const VOICE_SOURCES = ['cloned', 'designed'] as const
export type VoiceSource = (typeof VOICE_SOURCES)[number]

export interface TrainedAsset {
  id: string
  userId: string
  name: string
  description?: string | null
  type: TrainedAssetType
  loraUrl: string
  configUrl?: string | null
  triggerPhrase?: string | null
  trainerId: string
  loraInference: string | null
  subcategory: string
  linkedCharacterId?: string | null
  deletedAt?: string | null
}

export interface VoiceAsset {
  id: string
  userId: string
  name: string
  voiceId: string
  source: VoiceSource
  linkedCharacterId?: string | null
}

export interface LoraAssetRef {
  loraUrl: string
  triggerPhrase?: string | null
  loraInference?: string | null
  scale?: number
}

const VIDEO_LORA_KINDS = new Set<LoraInferenceDef['kind']>([
  'text',
  'first_frame',
  'reference',
  'video_edit',
])

export function isTrainedAssetType(value: string): value is TrainedAssetType {
  return (TRAINED_ASSET_TYPES as readonly string[]).includes(value)
}

export function isVoiceSource(value: string): value is VoiceSource {
  return (VOICE_SOURCES as readonly string[]).includes(value)
}

export function assetTypeFromTrainer(trains: string): TrainedAssetType {
  if (trains === 'character') return 'character'
  if (trains === 'audio_style') return 'audio_style'
  return 'style'
}

export function isLoraCapableEndpoint(endpoint: string): boolean {
  return Boolean(loraInferenceDef(endpoint))
}

export function loraCapableEndpoints(): string[] {
  return Object.keys(LORA_INFERENCE_REGISTRY)
}

export function isVideoLoraEndpoint(endpoint: string): boolean {
  const def = loraInferenceDef(endpoint)
  return Boolean(def && VIDEO_LORA_KINDS.has(def.kind))
}

export function endpointAcceptsAsset(endpoint: string, asset: LoraAssetRef): boolean {
  if (!loraPassFor(endpoint) || !asset.loraUrl?.trim()) return false
  const inference = asset.loraInference?.trim()
  if (!inference) return true
  if (inference === endpoint) return true
  const here = loraInferenceDef(endpoint)
  const src = loraInferenceDef(inference)
  if (here && src && here.base === src.base) return true
  return Object.values(TRAINER_REGISTRY).some(
    (row) => row.loraInference === inference && row.crossMode?.includes(endpoint),
  )
}

function kindForMode(mode: Mode): LoraInferenceDef['kind'] | null {
  if (mode === 'text') return 'text'
  if (mode === 'first_frame' || mode === 'first_last') return 'first_frame'
  if (mode === 'reference') return 'reference'
  if (mode === 'video_edit') return 'video_edit'
  return null
}

export class MissingLoraPathError extends Error {
  constructor(endpoint: string) {
    super(`No LoRA inference path for ${endpoint}. The trained asset was not applied.`)
    this.name = 'MissingLoraPathError'
  }
}

export function loraEndpointForMode(asset: LoraAssetRef, mode: Mode): string | null {
  const inference = asset.loraInference?.trim()
  if (!inference || !asset.loraUrl?.trim()) return null
  const wanted = kindForMode(mode)
  const candidates = new Set<string>([inference])
  const src = loraInferenceDef(inference)
  if (src) {
    for (const row of Object.values(LORA_INFERENCE_REGISTRY)) {
      if (row.base === src.base) candidates.add(row.id)
    }
  }
  const trainer = Object.values(TRAINER_REGISTRY).find((row) => row.loraInference === inference)
  const mechanism = trainer ? loraMechanism(trainer) : null
  if (mechanism) candidates.add(mechanism.endpoint)
  for (const id of trainer?.crossMode ?? []) candidates.add(id)
  if (wanted) {
    for (const id of candidates) {
      const def = loraInferenceDef(id)
      if (def && def.kind === wanted && isVideoLoraEndpoint(id)) return id
    }
  }
  return isVideoLoraEndpoint(inference) ? inference : null
}

function loraItem(pass: LoraPass, asset: LoraAssetRef): Record<string, unknown> {
  const item: Record<string, unknown> = {
    [pass.itemPath]: asset.loraUrl.trim(),
    [pass.itemScale]: asset.scale ?? 1,
  }
  if (pass.itemTarget) item[pass.itemTarget] = 'self'
  return item
}

export function applyLoraPass(
  endpoint: string,
  payload: Record<string, unknown>,
  promptKey: string,
  assets: LoraAssetRef[],
  properties?: Iterable<string>,
): void {
  if (!assets.length) return
  const pass = loraPassFor(endpoint)
  if (!pass) throw new MissingLoraPathError(endpoint)
  const props = properties ? new Set(properties) : null
  if (props && !props.has(pass.field)) throw new MissingLoraPathError(endpoint)
  const usable = assets.filter((asset) => endpointAcceptsAsset(endpoint, asset))
  if (!usable.length) throw new MissingLoraPathError(endpoint)
  payload[pass.field] = usable.map((asset) => loraItem(pass, asset))
  if (!pass.triggerInPrompt) return
  const current = String(payload[promptKey] ?? '')
  const missing = usable
    .map((asset) => asset.triggerPhrase?.trim())
    .filter((phrase): phrase is string => Boolean(phrase))
    .filter((phrase) => !current.includes(phrase))
  if (!missing.length) return
  payload[promptKey] = `${missing.join(', ')}, ${current}`.replace(/^, /, '')
}

const LORA_CONTROL: ModelControlSurface = {
  referenceClass: 'true_reference',
  maxReferenceImages: 4,
  firstLastFrame: true,
  cameraControl: 'prompt_only',
  motionBrush: false,
  nativeAudio: false,
}

function endpointsForLoraBase(base: string): Partial<Record<Mode, string>> {
  const out: Partial<Record<Mode, string>> = {}
  for (const row of Object.values(LORA_INFERENCE_REGISTRY)) {
    if (row.base !== base) continue
    if (row.kind === 'text') out.text = row.id
    if (row.kind === 'first_frame') {
      out.first_frame = row.id
      out.first_last = row.id
    }
    if (row.kind === 'reference') out.reference = row.id
    if (row.kind === 'video_edit') out.video_edit = row.id
  }
  return out
}

/** Resolvable ModelDef for a verified /lora inference id. Not a council pool member. */
export function loraInferenceModelDef(id: string): ModelDef | undefined {
  const inf = loraInferenceDef(id)
  if (!inf) return undefined
  const endpoints = endpointsForLoraBase(inf.base)
  const i2v = endpoints.first_frame
  const reference = endpoints.reference
  return {
    id: inf.id,
    provider: 'fal',
    endpoint: inf.id,
    i2vEndpoint: i2v,
    role: 'LORA',
    tier: 'studio',
    costPer5s: 0,
    silentOnly: true,
    pinned: true,
    canonicalId: inf.id,
    falEndpoint: inf.id,
    isExternal: false,
    supportsSeed: true,
    supportsCharRef: inf.kind === 'reference' || inf.kind === 'first_frame',
    referenceEndpoint: reference,
    control: {
      ...LORA_CONTROL,
      referenceClass: inf.kind === 'reference'
        ? 'true_reference'
        : inf.kind === 'first_frame'
          ? 'first_frame'
          : 'none',
      maxReferenceImages: inf.kind === 'reference' ? 4 : inf.kind === 'first_frame' ? 1 : 0,
    },
    endpoints,
  }
}

export function emptyLearnedCell(): PurposeScore {
  return { worked: 0, total: 0, score: 0.5 }
}

export function shouldDelegateTrainedLora(input: {
  purpose: string
  consistencyNeed?: number
  hasLoraAsset: boolean
  assetType?: TrainedAssetType | null
  modelOverride?: string | null
  learned?: Record<string, Partial<LearnedByPurpose>>
  loraEndpoint: string | null
}): boolean {
  if (input.modelOverride?.trim()) return false
  if (!input.hasLoraAsset || !input.loraEndpoint) return false
  if (input.assetType === 'audio_style') return false
  if (input.assetType !== 'style') {
    if (input.purpose !== 'consistency' && (input.consistencyNeed ?? 0) < 6) return false
  }
  const cell = input.learned?.[input.loraEndpoint]?.consistency ?? emptyLearnedCell()
  if (cell.total > 0 && isCircuitOpen(cell)) return false
  return isVideoLoraEndpoint(input.loraEndpoint)
}

export const TRAINED_LORA_DELEGATION = 'using trained LoRA for consistency'
