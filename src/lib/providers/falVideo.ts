import { runFal, extractVideoUrl, extractImageUrl } from '@/lib/fal/client'
import { getEndpointTimeout } from '@/lib/fal/falQueue'
import { assertModelIntegrity } from '@/lib/models/modelIntegrity'
import type { ModelDef } from '@/lib/models/resolve'
import { resolveReferenceEndpoint, resolveVideoEndpoint } from '@/lib/models/resolve'
import { T2V_MODEL_IDS } from '@/lib/orchestration/falEndpoints'
import type { SubProgressFn } from '@/lib/orchestration/types'
import { PIXVERSE_V56_TRANSITION, VEO_FIRST_LAST, OMNI_EDIT } from '@cinema/core'

function segmentIdForShot(shotIndex: number): string {
  return `shot-${shotIndex}`
}

async function callFalModel(
  modelId: string,
  input: Record<string, unknown>,
  onSubProgress?: (pct: number, message: string) => void,
  timeoutMs?: number,
  onPoll?: () => void | Promise<void>,
  checkpoint?: { jobId: string; segmentId: string; shotId: number },
  onSubmission?: (submission: import('@/lib/fal/falQueue').FalSubmission) => void | Promise<void>,
): Promise<string> {
  const submittedAt = Date.now()
  let inferenceLogged = false
  const falCheckpoint = checkpoint || onSubmission
    ? {
        load: async () => {
          if (!checkpoint) return null
          const { loadSubmissionCheckpoint } = await import('@/lib/orchestration/checkpoints')
          return loadSubmissionCheckpoint(checkpoint.jobId, checkpoint.segmentId)
        },
        save: async (submission: import('@/lib/fal/falQueue').FalSubmission) => {
          if (checkpoint) {
            const { saveSubmissionCheckpoint } = await import('@/lib/orchestration/checkpoints')
            await saveSubmissionCheckpoint(
              checkpoint.jobId,
              checkpoint.segmentId,
              checkpoint.shotId,
              submission,
            )
          }
          await onSubmission?.(submission)
        },
        clear: async () => {
          if (!checkpoint) return
          const { clearSubmissionCheckpoint } = await import('@/lib/orchestration/checkpoints')
          await clearSubmissionCheckpoint(checkpoint.jobId, checkpoint.segmentId)
        },
      }
    : undefined

  const data = await runFal(
    modelId,
    input,
    (update) => {
      if (update.status === 'IN_QUEUE') {
        const pos = update.position
        console.log(
          `[fal:${modelId}] in queue ${Math.round((Date.now() - submittedAt) / 1000)}s, position ${pos ?? '?'}`,
        )
        onSubProgress?.(0, `Queued (position ${pos ?? '?'})`)
      } else if (update.status === 'IN_PROGRESS') {
        if (!inferenceLogged) {
          console.log(
            `[fal:${modelId}] inference started after ${Math.round((Date.now() - submittedAt) / 1000)}s queue`,
          )
          inferenceLogged = true
        }
        onSubProgress?.(50, update.message ?? 'Generating…')
      }
    },
    timeoutMs ?? getEndpointTimeout(modelId),
    onPoll,
    falCheckpoint,
  )
  console.log(`[fal:${modelId}] complete after ${Math.round((Date.now() - submittedAt) / 1000)}s total`)

  const payload = data as { detail?: string; error?: string }
  if (payload?.detail === 'Not Found' || payload?.error?.includes('404')) {
    throw new Error(`FAL endpoint not found: ${modelId} — update registry`)
  }

  const url = extractVideoUrl(data) ?? extractImageUrl(data)
  if (!url) throw new Error(`fal model ${modelId} returned no video URL`)
  return url
}

export interface FalVideoParams {
  registryModel: string
  prompt: string
  duration: number
  resolution?: string
  imageUrl?: string
  endImageUrl?: string
  patientZeroUrl?: string
  characterIds?: string[]
  locationId?: string | null
  projectId?: string
  camera?: import('@cinema/core').PromptCamera | null
  genrePresetId?: string | null
  continueExactFrame?: boolean
  referenceImages?: { url: string; label?: string; role: 'character' | 'location'; primary?: boolean }[]
  referenceVideos?: { url: string; label?: string; role?: 'motion_ref' | 'style_ref' | 'continuation' }[]
  referenceAudios?: { url: string; label?: string; role?: 'dialogue' | 'music' | 'sfx' }[]
  videoUrl?: string
  jobId?: string
  shotIndex?: number
  characterLora?: import('@cinema/core').LoraAssetRef
  styleLora?: import('@cinema/core').LoraAssetRef
  onSubProgress?: SubProgressFn
  onPoll?: () => void | Promise<void>
  onSubmission?: (submission: import('@/lib/fal/falQueue').FalSubmission) => void | Promise<void>
}

export async function falVideo(
  _model: ModelDef,
  registryModel: string,
  params: FalVideoParams,
): Promise<string> {
  const hasStartFrame = Boolean(params.imageUrl)
  const modelId =
    resolveVideoEndpoint(registryModel, hasStartFrame) ?? T2V_MODEL_IDS[registryModel]

  if (!modelId) throw new Error(`Unknown FAL model: ${registryModel}`)

  const { conditionShotIdentity } = await import('@/lib/fal/shotIdentity')
  const identity = await conditionShotIdentity({
    prompt: params.prompt,
    endpoint: modelId,
    registryKey: registryModel,
    characterIds: params.characterIds,
    locationId: params.locationId,
    projectId: params.projectId,
    anchorFrameUrl: params.imageUrl,
    camera: params.camera,
    genrePresetId: params.genrePresetId,
  })
  const seedance = registryModel === 'seedance-2.0'
  const veo = registryModel === 'veo-3.1'
  const wan = registryModel === 'wan-2.7'
  const wan30 = registryModel === 'wan-3.0'
  const grok = registryModel === 'grok-imagine-video'
  const pixverse = registryModel === 'pixverse-v5.6'
  const horse = registryModel === 'happyhorse-1.0'
  const ltx = registryModel === 'ltx-2.3-fast'
  const hailuo = registryModel === 'hailuo-02'
  const omni = registryModel === 'gemini-omni'
  const holdFrame = (seedance || wan || wan30 || grok || horse || omni) && params.continueExactFrame === true
  const firstLast = (seedance || veo) && Boolean(params.imageUrl?.trim() && params.endImageUrl?.trim())
  const wanFrames = wan && Boolean(params.imageUrl?.trim() && params.endImageUrl?.trim())
  const wan30Frames = wan30 && Boolean(params.imageUrl?.trim() && params.endImageUrl?.trim())
  const omniFrames = omni && Boolean(params.imageUrl?.trim() && params.endImageUrl?.trim())
  const omniEdit = omni && Boolean(params.videoUrl?.trim())
  const pixverseFrames = pixverse && Boolean(params.imageUrl?.trim() && params.endImageUrl?.trim())
  const directorRefs = (seedance && !holdFrame && !firstLast)
    || (omni && !holdFrame && !omniFrames && !omniEdit)
    ? [...(params.referenceImages ?? [])]
    : []
  if (
    seedance && !holdFrame && !firstLast && params.patientZeroUrl
    && !directorRefs.some((ref) => ref.url === params.patientZeroUrl)
  ) {
    directorRefs.unshift({ url: params.patientZeroUrl, role: 'character', label: 'the character' })
  }
  const referenceEndpoint = resolveReferenceEndpoint(registryModel)
  const useReferences = !holdFrame && !firstLast && !wanFrames && !wan30Frames && !omniFrames && !omniEdit && Boolean(referenceEndpoint) && (
    identity.referenceImages.length > 0 || directorRefs.length > 0
    || ((wan || wan30 || omni) && (params.referenceVideos?.length ?? 0) > 0)
  )
  const i2vEndpoint = resolveVideoEndpoint(registryModel, true)
  const t2vEndpoint = resolveVideoEndpoint(registryModel, false)
  const canFirstFrame = Boolean(i2vEndpoint && t2vEndpoint && i2vEndpoint !== t2vEndpoint)
  const useI2V = !useReferences && hasStartFrame && canFirstFrame
  if (hasStartFrame && !useReferences && !useI2V) {
    console.warn('[video_mode]', JSON.stringify({
      model: registryModel,
      reason: 'still exists but this model has no reference or first-frame endpoint',
    }))
  }
  const submitEndpoint = omniEdit
    ? OMNI_EDIT
    : firstLast && veo
    ? VEO_FIRST_LAST
    : pixverseFrames
      ? PIXVERSE_V56_TRANSITION
      : useReferences && referenceEndpoint
        ? referenceEndpoint
        : useI2V && i2vEndpoint
          ? i2vEndpoint
          : modelId

  const { buildPayload } = await import('@/lib/fal/videoPayloads')
  const input = await buildPayload(submitEndpoint, registryModel, {
    prompt: params.prompt,
    duration: params.duration,
    resolution: params.resolution,
    aspectRatio: '16:9',
    imageUrl: useReferences || useI2V ? params.imageUrl : undefined,
    endImageUrl: params.endImageUrl,
    audioPolicy: 'elevenlabs',
    characterIds: params.characterIds,
    locationId: params.locationId,
    projectId: params.projectId,
    shotIndex: params.shotIndex,
    camera: params.camera,
    genrePresetId: params.genrePresetId,
    characterLora: params.characterLora,
    styleLora: params.styleLora,
    referenceImages: directorRefs,
    referenceVideos: seedance || wan || wan30 || omni ? params.referenceVideos : undefined,
    referenceAudios: seedance ? params.referenceAudios : undefined,
    videoUrl: omni ? params.videoUrl : undefined,
  }, identity)
  if (params.patientZeroUrl && !useReferences && !seedance && !veo && !wan && !wan30 && !hailuo && !grok && !pixverse && !horse && !ltx && !omni) {
    input.reference_image_url = params.patientZeroUrl
  }

  console.log('[video_mode]', JSON.stringify({
    model: registryModel,
    endpoint: submitEndpoint,
    imageToVideo: useI2V,
    reference: useReferences,
  }))

  assertModelIntegrity(params.registryModel, _model, submitEndpoint, hasStartFrame, useReferences)

  const shotIndex = params.shotIndex
  const checkpoint = params.jobId && typeof shotIndex === 'number' && Number.isFinite(shotIndex)
    ? {
        jobId: params.jobId,
        segmentId: segmentIdForShot(shotIndex),
        shotId: shotIndex,
      }
    : undefined

  return callFalModel(
    submitEndpoint,
    input,
    (pct, message) => params.onSubProgress?.({ pct, message, vendor: 'fal' }),
    getEndpointTimeout(submitEndpoint),
    params.onPoll,
    checkpoint,
    params.onSubmission,
  )
}
