import type { FamilyFieldMap, ModelControlSurface } from '../types/provider'
import { TOOL_EXPOSURE, type ToolCell, type ToolExposureRow } from './toolMatrix'

/**
 * Controls the director may show. A cell is exposed only when the tool matrix
 * marks it schema and the family field map names the payload field.
 * Audio toggles stay hidden: live submit forces them off, and Grok has no field.
 * Kling v3 has no voice_id. Seedance dialogue audio is the @Audio reference.
 */

const EXPOSURE_ID: Record<string, string> = {
  'hailuo-02': 'hailuo',
  'gemini-omni-flash': 'gemini-omni',
}

export type VoicePath = 'none' | 'audio_tag'

export interface ExposedControls {
  model: string
  cameraPrompt: boolean
  reference: boolean
  referenceField?: string
  firstFrame: boolean
  firstFrameField?: string
  lastFrame: boolean
  lastFrameField?: string
  seed: boolean
  seedField?: string
  negative: boolean
  negativeField?: string
  audioToggle: boolean
  voice: VoicePath
  nativeAudioLockedOn: boolean
}

function schemaCell(cell: ToolCell | undefined): boolean {
  return cell === 'schema'
}

export function exposureRow(modelId: string): ToolExposureRow | undefined {
  const key = EXPOSURE_ID[modelId] ?? modelId
  return TOOL_EXPOSURE.find((row) => row.model === key)
}

function referenceField(fields: FamilyFieldMap | undefined): string | undefined {
  const refs = fields?.references
  if (!refs || refs.max < 1) return undefined
  if (refs.mode === 'prompt_tag') return refs.tag
  return refs.field
}

export function exposedControls(
  modelId: string,
  fields?: FamilyFieldMap,
  control?: ModelControlSurface,
): ExposedControls {
  const row = exposureRow(modelId)
  if (!row?.wired) {
    return {
      model: modelId,
      cameraPrompt: control?.cameraControl === 'prompt_only' || control?.cameraControl === 'presets',
      reference: control?.referenceClass === 'true_reference',
      firstFrame: Boolean(control && control.referenceClass !== 'none'),
      lastFrame: Boolean(control?.firstLastFrame),
      lastFrameField: control?.firstLastFrame ? fields?.lastFrame : undefined,
      seed: false,
      negative: false,
      audioToggle: false,
      voice: 'none',
      nativeAudioLockedOn: false,
    }
  }

  const reference = schemaCell(row.reference) && (fields?.references.max ?? 0) > 0
  const lastFrame = schemaCell(row.firstLast) && Boolean(fields?.lastFrame)
  const seed = schemaCell(row.seed) && Boolean(fields?.seed)
  const negative = schemaCell(row.negative) && Boolean(fields?.negative)
  return {
    model: modelId,
    cameraPrompt: schemaCell(row.camera),
    reference,
    referenceField: reference ? referenceField(fields) : undefined,
    firstFrame: Boolean(fields?.firstFrame),
    firstFrameField: fields?.firstFrame,
    lastFrame,
    lastFrameField: lastFrame ? fields?.lastFrame : undefined,
    seed,
    seedField: seed ? fields?.seed : undefined,
    negative,
    negativeField: negative ? fields?.negative : undefined,
    audioToggle: schemaCell(row.nativeAudio) && row.exposeNativeAudio,
    voice: schemaCell(row.voice) && modelId === 'seedance-2.0' ? 'audio_tag' : 'none',
    nativeAudioLockedOn: modelId === 'grok-imagine-video' && schemaCell(row.nativeAudio) && !row.exposeNativeAudio,
  }
}
