/**
 * Provider-aware video dispatch — routes each model to its own client.
 * Never drag Runway/Grok/Replicate through the FAL queue.
 */

import { dispatchVideoProvider, ModelIntegrityError, resolveModel } from '@cinema/core'
import { assertGenerationNotPaused } from '@/lib/generation/pause'
import { falVideo } from '@/lib/providers/falVideo'
import { grokVideo } from '@/lib/providers/grok'
import { replicateVideo } from '@/lib/providers/replicate'
import { runwayVideo } from '@/lib/providers/runway'
import { conditionShotIdentity } from '@/lib/fal/shotIdentity'
import { draftPreviewLabel, suggestDraftPreviewModel } from './costGuard'
import type { GenerationMode } from './costGuard'
import type { SubProgressFn } from './types'
import type { PromptCamera } from '@cinema/core'

export interface GenerateVideoParams {
  model: string
  prompt: string
  duration: number
  imageUrl?: string
  endImageUrl?: string
  patientZeroUrl?: string
  characterIds?: string[]
  locationId?: string | null
  projectId?: string
  camera?: PromptCamera | null
  genrePresetId?: string | null
  continueExactFrame?: boolean
  referenceImages?: { url: string; label?: string; role: 'character' | 'location'; primary?: boolean }[]
  referenceVideos?: { url: string; label?: string; role?: 'motion_ref' | 'style_ref' | 'continuation' }[]
  referenceAudios?: { url: string; label?: string; role?: 'dialogue' | 'music' | 'sfx' }[]
  cameraPrecision?: boolean
  jobId?: string
  shotIndex?: number
  generationMode?: GenerationMode
  /** Set by the visible Draft / Studio / Blockbuster tier. Omitted on a manual model override. */
  resolution?: string
  /** LTX preview only. Requires draftPreviewLabel(selected) to be the text the user was shown. */
  explicitDraftPreview?: boolean
  shownDraftLabel?: string
  resumeRequestId?: string
  characterLora?: import('@cinema/core').LoraAssetRef
  styleLora?: import('@cinema/core').LoraAssetRef
  videoUrl?: string
  onSubProgress?: SubProgressFn
  onPoll?: () => void | Promise<void>
  onSubmission?: (submission: import('@/lib/fal/falQueue').FalSubmission) => void | Promise<void>
}

export async function generateVideo(params: GenerateVideoParams): Promise<string> {
  assertGenerationNotPaused(params.model)
  const mode = params.generationMode ?? 'production'
  const selected = resolveModel(params.model)
  let registryModel = selected.canonicalId
  if (params.explicitDraftPreview) {
    const preview = suggestDraftPreviewModel(selected.canonicalId)
    const requiredLabel = draftPreviewLabel(selected.canonicalId)
    if (!preview || params.shownDraftLabel !== requiredLabel) {
      throw new ModelIntegrityError(
        `Draft preview of ${selected.canonicalId} requires the visible label: ${requiredLabel}`,
      )
    }
    console.log('[dispatch] explicit draft preview', { label: requiredLabel, preview })
    registryModel = preview
  }
  const def = resolveModel(registryModel)
  if (def.canonicalId !== registryModel) {
    throw new ModelIntegrityError(
      `Model substitution detected: flow intends '${registryModel}' but resolved '${def.canonicalId}'.`,
    )
  }
  if (!params.explicitDraftPreview && def.canonicalId !== selected.canonicalId) {
    throw new ModelIntegrityError(
      `Model substitution detected: user selected '${selected.canonicalId}' but dispatch resolved '${def.canonicalId}'.`,
    )
  }

  let prompt = params.prompt?.trim() ?? ''
  let imageUrl = params.imageUrl
  if (def.provider !== 'fal') {
    const identity = await conditionShotIdentity({
      prompt,
      endpoint: def.endpoint,
      registryKey: def.canonicalId,
      characterIds: params.characterIds,
      locationId: params.locationId,
      projectId: params.projectId,
      anchorFrameUrl: imageUrl,
      camera: params.camera,
      genrePresetId: params.genrePresetId,
    })
    prompt = identity.prompt
    if (!imageUrl && identity.imageUrl) imageUrl = identity.imageUrl
  }

  if (def.provider !== 'fal' && (!prompt || prompt.length < 3)) {
    const label = params.shotIndex == null ? 'shot' : `shot ${params.shotIndex}`
    throw new Error(`${label} has no prompt`)
  }

  if (def.provider === 'elevenlabs' || def.provider === 'suno') {
    throw new Error(
      `Model '${registryModel}' is an audio provider — use the audio pipeline, not video dispatch`,
    )
  }

  console.log(
    `[dispatch] model=${params.model} → canonical=${def.canonicalId} provider=${def.provider} mode=${mode}`,
  )

  return dispatchVideoProvider(def.provider, {
    grok: () => grokVideo(def, {
      prompt,
      duration: params.duration,
      imageUrl,
      onSubProgress: params.onSubProgress,
    }),
    runway: () => runwayVideo(def, {
      prompt,
      duration: params.duration,
      imageUrl,
      existingTaskId: params.resumeRequestId,
      onTaskId: async (taskId) => {
        await params.onSubmission?.({
          requestId: taskId,
          statusUrl: 'runway',
          responseUrl: 'runway',
          cancelUrl: '',
          endpoint: 'runway',
        })
      },
      onSubProgress: params.onSubProgress,
    }),
    replicate: () => replicateVideo(def, {
      prompt,
      duration: params.duration,
      imageUrl,
      onSubProgress: params.onSubProgress,
    }),
    fal: () => falVideo(def, def.canonicalId, {
      registryModel: def.canonicalId,
      prompt,
      duration: params.duration,
      resolution: params.resolution,
      imageUrl,
      endImageUrl: params.endImageUrl,
      patientZeroUrl: params.patientZeroUrl,
      characterIds: params.characterIds,
      locationId: params.locationId,
      projectId: params.projectId,
      camera: params.camera,
      genrePresetId: params.genrePresetId,
      continueExactFrame: params.continueExactFrame,
      referenceImages: params.referenceImages,
      referenceVideos: params.referenceVideos,
      referenceAudios: params.referenceAudios,
      jobId: params.jobId,
      shotIndex: params.shotIndex,
      characterLora: params.characterLora,
      styleLora: params.styleLora,
      videoUrl: params.videoUrl,
      onSubProgress: params.onSubProgress,
      onPoll: params.onPoll,
      onSubmission: params.onSubmission,
    }),
  })
}
