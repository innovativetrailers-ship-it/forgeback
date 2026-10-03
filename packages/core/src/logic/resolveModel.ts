import type { ModelDef } from '../types/provider'
import {
  entryProvider,
  MODEL_REGISTRY_ALIASES,
  modelRole,
  modelTier,
  VIDEO_MODEL_REGISTRY,
  type RegistryEntry,
} from './registry'
import { loraInferenceModelDef } from './trainedAsset'
import { klingModeModel } from './kling'
import { seedanceModeModel } from './seedance'
import { veoModeModel } from './veo'
import { wanModeModel } from './wan'
import { wan30ModeModel } from './wan30'
import { grokModeModel } from './grok'
import { pixverseModeModel } from './pixverse'
import { happyhorseModeModel } from './happyhorse'
import { ltxModeModel } from './ltx'
import { hailuoModeModel } from './hailuo'
import { omniModeModel } from './omni'

export class ModelResolveError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'ModelResolveError'
  }
}

const LEGACY_IDS: Record<string, string> = {
  'kling-pro': 'kling-3.0',
  'kling-standard': 'kling-3.0',
  kling: 'kling-3.0',
  veo3: 'veo-3.1',
  'veo-3': 'veo-3.1',
  'veo3.1': 'veo-3.1',
  'veo-3-1': 'veo-3.1',
  seedance: 'seedance-2.0',
  ltx: 'ltx-2.3-fast',
  'ltx-2.3': 'ltx-2.3-fast',
  'ltx-fast': 'ltx-2.3-fast',
  runway: 'runway-gen4',
  'runway-gen4.5': 'runway-gen4',
  'gen4.5': 'runway-gen4',
  'gen-4.5': 'runway-gen4',
  'gen-4-5': 'runway-gen4',
  grok: 'grok-imagine-video',
  'grok-imagine': 'grok-imagine-video',
  imagine: 'grok-imagine-video',
  'grok-video': 'grok-imagine-video',
  animatediff: 'ltx-2.3-fast',
  omni: 'gemini-omni',
  'gemini-omni-flash': 'gemini-omni',
  'omni-flash': 'gemini-omni',
  'gemini-omni-flash-1.1': 'gemini-omni',
}

export function normaliseModelId(id: string | undefined): string {
  if (!id?.trim()) {
    throw new Error('normaliseModelId: model id is required — cannot default to a fallback model')
  }
  return LEGACY_IDS[id] ?? id
}

export function falBaseApp(endpoint: string): string {
  return endpoint.split('/').slice(0, 2).join('/')
}

function toModelDef(id: string, entry: RegistryEntry): ModelDef {
  const provider = entryProvider(id, entry)
  const mode = id === 'seedance-2.0'
    ? seedanceModeModel()
    : id === 'kling-3.0'
      ? klingModeModel()
      : id === 'veo-3.1'
        ? veoModeModel()
          : id === 'wan-2.7'
          ? wanModeModel()
          : id === 'wan-3.0'
            ? wan30ModeModel()
          : id === 'grok-imagine-video'
            ? grokModeModel()
          : id === 'pixverse-v5.6'
            ? pixverseModeModel()
          : id === 'happyhorse-1.0'
            ? happyhorseModeModel()
          : id === 'ltx-2.3-fast'
            ? ltxModeModel()
          : id === 'hailuo-02'
            ? hailuoModeModel()
          : id === 'gemini-omni'
            ? omniModeModel()
            : undefined
  return {
    id,
    provider,
    endpoint: entry.falEndpoint,
    i2vEndpoint: entry.i2vEndpoint,
    role: modelRole(id),
    tier: modelTier(id),
    costPer5s: 0,
    silentOnly: id !== 'grok-imagine-video',
    pinned: true,
    canonicalId: normaliseModelId(id),
    falEndpoint: entry.falEndpoint,
    isExternal: provider !== 'fal',
    supportsSeed: entry.supportsSeed,
    supportsCharRef: entry.supportsCharRef,
    referenceEndpoint: entry.referenceEndpoint,
    control: entry.control,
    endpoints: mode?.endpoints,
    fields: mode?.fields,
    limits: mode?.limits,
  }
}

export function modelAcceptsEndFrame(id: string): boolean {
  try {
    return resolveModel(id).control.firstLastFrame
  } catch {
    return false
  }
}

export function modelSupportsSeed(def: { supportsSeed: boolean }): boolean {
  return def.supportsSeed
}

export function modelSupportsCharRef(def: { supportsCharRef: boolean }): boolean {
  return def.supportsCharRef
}

export function resolveModel(id: string): ModelDef {
  const trimmed = id.trim()
  const canon = normaliseModelId(trimmed.toLowerCase().replace(/[_\s]+/g, '-'))
  const lora = loraInferenceModelDef(trimmed) ?? loraInferenceModelDef(canon)
  if (lora) return lora

  const aliasTarget = MODEL_REGISTRY_ALIASES[canon]
  const key = VIDEO_MODEL_REGISTRY[canon] ? canon : aliasTarget
  const entry = key ? VIDEO_MODEL_REGISTRY[key] : undefined

  if (!entry) {
    throw new ModelResolveError(
      `Unknown model '${id}' (canonical '${canon}'). Known: ${Object.keys(VIDEO_MODEL_REGISTRY).join(', ')}`,
    )
  }
  const provider = entryProvider(key, entry)
  if (provider === 'elevenlabs' || provider === 'suno') {
    throw new ModelResolveError(
      `Model '${id}' is an audio provider — use the audio pipeline, not video dispatch`,
    )
  }
  if (provider === 'fal' && !entry.falEndpoint) {
    throw new ModelResolveError(`Model '${canon}' has no FAL endpoint mapping`)
  }
  return toModelDef(key, entry)
}

export function assertModelsResolvable(modelIds: string[]): void {
  for (const id of modelIds) resolveModel(id)
}

export function resolveReferenceEndpoint(registryModel: string): string | undefined {
  return resolveModel(registryModel).referenceEndpoint
}

/** reference-to-video, else a distinct image-to-video endpoint, else the model cannot hold a still. */
export function stillHold(id: string): 'reference' | 'first_frame' | null {
  try {
    const def = resolveModel(id)
    if (def.referenceEndpoint) return 'reference'
    if (def.i2vEndpoint && def.i2vEndpoint !== def.falEndpoint) return 'first_frame'
    return null
  } catch {
    return null
  }
}

export function resolveVideoEndpoint(registryModel: string, hasStartFrame: boolean): string | undefined {
  const def = resolveModel(registryModel)
  if (def.isExternal) return def.falEndpoint
  if (hasStartFrame && def.i2vEndpoint && def.i2vEndpoint !== def.falEndpoint) {
    return def.i2vEndpoint
  }
  return def.falEndpoint
}
