import { logCaught } from '@/lib/diagnostics/caught'
import { db } from '@/lib/db'
import { appendJobProgressEvent } from '@/lib/jobs/jobProgressEvents'
import { resolveModel } from '@/lib/models/resolveModel'
import { traced } from '@/lib/obs/traced'
import { getClipAnchorFrame, listShotPlan } from '@/lib/studio/shotPlan'
import { persistCompletedClip } from '@/lib/studio/batchClipSync'
import { isGenerationPaused, isGenerationPausedError } from '@/lib/generation/pause'
import { extractVideoUrl } from '@/lib/fal/client'
import { parseFalSubmission, pollFalResult, pollFalStatusOnce, serializeFalSubmission } from '@/lib/fal/falQueue'
import { callVideoModel, extractTailFrame, getModelTimeout, withTimeout } from '@/lib/orchestration/bridgedGeneration'
import type { GenerationMode } from '@/lib/orchestration/costGuard'
import { delegate, routeShotAudio } from '@cinema/core'
import { rememberContinuity } from '@/lib/cognition/continuity'
import { recordShotOutcome } from '@/lib/cognition/learnOutcomes'
import { learnedOverlayForGate } from '@/lib/diagnostics/overlay'
import { withGenContext, patchGen, currentGen } from '@/lib/diagnostics/correlation'
import { tasteProfileFor } from '@/lib/cognition/shotRatings'
import { parseQualityTier, TIER_POLICY, toRagConstraint } from '@/lib/orchestration/tierPolicy'
import { assetsForShot } from '@/lib/training/assets'

export interface ProcessShotGenerateInput {
  jobId: string
  userId: string
  projectId: string
  clipId: string
  prompt?: string
  anchorFrameUrl?: string
  modelOverride?: string | null
  mode?: GenerationMode
  qualityTier?: string
}

export async function processShotGenerateJob(input: ProcessShotGenerateInput): Promise<void> {
  return withGenContext({
    shotId: input.clipId,
    jobId: input.jobId,
    userId: input.userId,
  }, () => runShotGenerateJob(input))
}

async function runShotGenerateJob(input: ProcessShotGenerateInput): Promise<void> {
  const { jobId, clipId, projectId, prompt: overridePrompt, anchorFrameUrl: inputAnchor, modelOverride } = input

  if (isGenerationPaused()) {
    const msg = 'Generation is paused (GENERATION_PAUSED). Set GENERATION_PAUSED=false to enable.'
    console.warn('generation_paused_skip', { jobId, clipId })
    await db.studioClip.update({
      where: { id: clipId },
      data: {
        status: 'AWAITING_DIRECTION',
        generatingAt: null,
        generateClaimJobId: null,
        generateClaimedBy: null,
        generateClaimedAt: null,
      },
    }).catch((writeErr) => {
      logCaught('clip_reset_failed', writeErr, { jobId, stage: 'generation_paused' })
      throw writeErr
    })
    await appendJobProgressEvent(
      jobId,
      { phase: 'cancelled', status: 'paused', detail: msg },
      { status: 'FAILED', errorMessage: msg },
    )
    return
  }

  const clip = await traced(jobId, 'db_load_shot', 8_000, () =>
    db.studioClip.findUnique({
      where: { id: clipId },
      include: { scene: { select: { projectId: true, sceneNumber: true } } },
    }),
  )
  if (!clip || clip.scene.projectId !== projectId) {
    throw new Error(`Clip ${clipId} not found`)
  }

  if (clip.generateClaimJobId && clip.generateClaimJobId !== jobId) {
    console.log('[shot-generate] attached to in-flight claim — not submitting', {
      clipId,
      jobId,
      holder: clip.generateClaimJobId,
    })
    await appendJobProgressEvent(
      jobId,
      {
        phase: 'complete',
        status: 'completed',
        detail: JSON.stringify({ shotId: clipId, attachedTo: clip.generateClaimJobId }),
      },
      {
        status: 'COMPLETE',
        statusMessage: 'Attached to in-flight generation',
      },
    )
    return
  }

  if (clip.status === 'COMPLETED' && clip.videoUrl?.trim()) {
    console.log('[shot-generate] idempotent skip — already completed with videoUrl', { clipId, jobId })
    await appendJobProgressEvent(
      jobId,
      {
        phase: 'complete',
        status: 'completed',
        detail: JSON.stringify({ shotId: clipId, videoUrl: clip.videoUrl, idempotent: true }),
        pct: 100,
      },
      {
        status: 'COMPLETE',
        progressPct: 100,
        outputUrl: clip.videoUrl,
        completedAt: new Date(),
        statusMessage: 'Shot already complete',
      },
    )
    return
  }

  const mode =
    input.mode ??
    (modelOverride ?? clip.modelOverride ? 'production' : 'draft')

  const { shots } = await traced(jobId, 'shot_plan_read', 8_000, () => listShotPlan(projectId))
  const card = shots.find((s) => s.id === clipId)
  if (!card) throw new Error('Shot not in plan')

  const prompt = (overridePrompt ?? clip.prompt).trim()
  if (prompt.length < 3) throw new Error('Shot prompt is required')

  const manual = (modelOverride === null ? null : (modelOverride ?? clip.modelOverride))?.trim() || null
  const playbook = await (await import('@/lib/playbook')).loadActivePlaybook(input.userId, projectId).catch((err) => {
    console.warn("[caught] src/lib/jobs/processShotGenerateJob.ts:133", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (null)
  })
  const { applyPlaybookToShots } = await import('@cinema/core')
  const playbookApplied = applyPlaybookToShots([{
    visualPrompt: prompt,
    duration: clip.duration,
    hasDialogue: Boolean(card.dialogueText),
    shotSize: clip.shotSize ?? undefined,
    genrePresetId: clip.genrePresetId,
  }], playbook)[0]
  let qualityName: string | undefined = input.qualityTier
  if (!qualityName && playbook?.generation?.defaultQualityTier) {
    const t = playbook.generation.defaultQualityTier
    qualityName = t === 'draft' ? 'Draft' : t === 'blockbuster' ? 'Blockbuster' : 'Studio'
  }
  const qualityTier = parseQualityTier(qualityName)
  const tierPolicy = TIER_POLICY[qualityTier]
  let assignedModel: string
  const learned = await learnedOverlayForGate(input.userId).catch((err) => {
    console.warn("[caught] src/lib/jobs/processShotGenerateJob.ts:150", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (undefined)
  })
  const taste = await tasteProfileFor(input.userId).catch((err) => {
    console.warn("[caught] src/lib/jobs/processShotGenerateJob.ts:151", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (undefined)
  })
  const projectRow = await db.project.findUnique({
    where: { id: projectId },
    select: { styleLoraId: true, genrePresetId: true },
  })
  const loras = await assetsForShot({
    userId: input.userId,
    characterIds: clip.characterIds,
    characterLoraId: clip.characterLoraId,
    styleLoraId: clip.styleLoraId,
    projectStyleLoraId: projectRow?.styleLoraId,
  })
  try {
    const chosen = await delegate({
      id: clipId,
      visualPrompt: [playbookApplied.visualPrompt, playbookApplied.playbookFragment].filter(Boolean).join(' '),
      duration: playbookApplied.duration ?? clip.duration,
      purpose: clip.purpose ?? undefined,
      hasDialogue: Boolean(card.dialogueText),
      cameraPrecision: clip.cameraPrecision,
      cameraMove: clip.cameraMove ?? undefined,
      characterIds: clip.characterIds,
      locationId: clip.locationId,
      anchorFrameUrl: inputAnchor ?? clip.anchorFrameUrl,
      endFrameUrl: clip.endFrameUrl,
      chainFrom: clip.chainFrom,
      moneyShot: clip.moneyShot,
      modelOverride: manual,
      characterLora: loras.characterLora,
      styleLora: loras.styleLora,
      consistencyNeed: loras.characterLora ? 8 : undefined,
    }, { qualityTier: toRagConstraint(qualityTier), taste, playbook }, undefined, learned)
    assignedModel = resolveModel(chosen.model).canonicalId
    patchGen({ model: assignedModel, mode: chosen.mode, purpose: chosen.purpose })
    await db.studioClip.update({
      where: { id: clipId },
      data: {
        assignedModel,
        purpose: chosen.purpose,
        delegationReason: chosen.reason,
        delegatedMode: chosen.mode,
        ...(manual ? {} : { modelOverride: null }),
      },
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    const { captureGenerationError } = await import('@/lib/diagnostics/capture')
    await captureGenerationError({
      err,
      rawError: message,
      shotId: clipId,
      userId: input.userId,
      jobId,
      stage: 'assembly',
      endpoint: 'delegate',
    })
    await db.studioClip.update({
      where: { id: clipId },
      data: {
        status: 'FAILED',
        generatingAt: null,
        generateClaimJobId: null,
        generateClaimedBy: null,
        generateClaimedAt: null,
      },
    }).catch((writeErr) => {
      // The assembly error is rethrown below. This write is the clip status.
      logCaught('clip_status', writeErr, { jobId, stage: 'assembly' })
    })
    await appendJobProgressEvent(
      jobId,
      { phase: 'failed', status: 'failed', detail: message },
      { status: 'FAILED', errorMessage: message },
    )
    throw err
  }

  let crossSceneAnchor: string | undefined
  if (inputAnchor) {
    crossSceneAnchor = inputAnchor
  } else if (clip.anchorFrameUrl) {
    crossSceneAnchor = clip.anchorFrameUrl
  } else if (clip.anchorSource !== 'NONE') {
    crossSceneAnchor = await traced(jobId, 'anchor_prepare', 20_000, async () => {
      if (clip.anchorPolicy === 'previous-frame') {
        return getClipAnchorFrame(projectId, card.shotNumber)
      }
      if (clip.anchorPolicy === 'keyframe') {
        return clip.keyframeUrl ?? undefined
      }
      return undefined
    })
  }

  if (clip.status !== 'GENERATING') {
    await db.studioClip.update({
      where: { id: clipId },
      data: { status: 'GENERATING', prompt, generatingAt: new Date() },
    })
  }

  await traced(jobId, 'emit_progress', 5_000, () =>
    appendJobProgressEvent(
      jobId,
      { phase: `shot_${card.shotNumber}_start`, status: 'running', detail: `Generating shot ${card.shotNumber}…`, pct: 10 },
      { status: 'PROCESSING', progressPct: 10, phase: 'generating' },
    ),
  )

  let providerUrl = ''
  let completed = false

  try {
    if (isGenerationPaused()) {
      console.warn('generation_paused_skip_before_submit', { jobId, clipId })
      await db.studioClip.update({
        where: { id: clipId },
        data: {
          status: 'AWAITING_DIRECTION',
          generatingAt: null,
          generateClaimJobId: null,
          generateClaimedBy: null,
          generateClaimedAt: null,
        },
      })
      await appendJobProgressEvent(
        jobId,
        { phase: 'cancelled', status: 'paused', detail: 'Generation paused before submit' },
        { status: 'FAILED', errorMessage: 'Generation paused (GENERATION_PAUSED)' },
      )
      return
    }

    const videoUrl = await traced(jobId, 'fal_submit', 30_000, () =>
      withTimeout(
        (async () => {
          if (clip.falRequestId) {
            const provider = (() => {
              try { return resolveModel(assignedModel).provider } catch (err) {
                console.warn("[caught] src/lib/jobs/processShotGenerateJob.ts:289", err instanceof Error ? { name: err.name, message: err.message } : err)
 return 'fal' }
            })()
            if (provider === 'runway') {
              const { pollStatus } = await import('@/lib/providers/runway')
              console.log('[shot-generate] resume existing Runway task', {
                clipId,
                jobId,
                requestId: clip.falRequestId,
              })
              const polled = await pollStatus(clip.falRequestId)
              if (polled.status === 'failed' || !polled.videoUrl?.trim()) {
                throw new Error(polled.error ?? `Shot ${clipId}: resumed Runway task returned no videoUrl`)
              }
              return polled.videoUrl
            }
            const submission = clip.falSubmission ? parseFalSubmission(clip.falSubmission) : null
            if (!submission || submission.requestId !== clip.falRequestId) {
              throw new Error(
                `Shot ${clipId} has falRequestId ${clip.falRequestId} but no resumable FAL submission — refusing a second submit`,
              )
            }
            const once = await pollFalStatusOnce(submission)
            if (once.status === 'COMPLETED') {
              const ready = extractVideoUrl(once.data)?.trim()
              if (ready) return ready
            }
            const dead = once.status === 'FAILED'
              && ((once.error ?? '').startsWith('FAL generation failed') || (once.error ?? '').includes('404'))
            if (dead) {
              console.warn('[shot-generate] prior FAL request failed; one new submit', {
                clipId,
                requestId: clip.falRequestId,
              })
              await db.studioClip.update({
                where: { id: clipId },
                data: { falRequestId: null, falSubmission: null },
              })
            } else {
              console.log('[shot-generate] resume existing FAL request', {
                clipId,
                jobId,
                requestId: clip.falRequestId,
              })
              const result = await pollFalResult(submission, {
                jobId,
                timeoutMs: getModelTimeout(assignedModel),
              })
              const resumed = extractVideoUrl(result.data)
              if (!resumed?.trim()) {
                throw new Error(`Shot ${clipId}: resumed FAL request returned no videoUrl`)
              }
              return resumed
            }
          }

          await rememberContinuity(projectId, prompt)
          const audio = routeShotAudio({
            videoModel: assignedModel,
            needsDialogue: Boolean(clip.lipSyncEnabled),
            speakerCount: clip.characterIds?.length ?? 0,
            wantsLipSync: clip.lipSyncEnabled,
          })
          console.log('[shot-generate] audio_route', {
            clipId,
            model: assignedModel,
            path: audio.path,
            kind: audio.kind ?? null,
            reason: audio.reason,
          })
          let submitModel = assignedModel
          let referenceVideos: Array<{ url: string; role: 'continuation' }> | undefined
          if (clip.chainFrom) {
            const { durableChainReference } = await import('@/lib/orchestration/chainReference')
            const { CONTINUITY_MODEL_ID, isVideoReferenceCapable } = await import('@cinema/core')
            const owned = await durableChainReference(clip.chainFrom)
            if (owned) {
              referenceVideos = [{ url: owned.fetchUrl, role: 'continuation' }]
              if (!isVideoReferenceCapable(submitModel) && !clip.modelOverride) {
                submitModel = CONTINUITY_MODEL_ID
              }
              console.log('[chain_feed]', { clipId, reference: owned.mediaPath, model: submitModel })
              console.log('[chain_model]', { clipId, model: submitModel, reference: owned.mediaPath })
            } else {
              console.log('[chain_feed]', { clipId, reference: null, reason: 'no durable prior video' })
            }
          }
          return callVideoModel({
            model: submitModel,
            referenceVideos,
            prompt,
            duration: clip.duration,
            imageUrl: crossSceneAnchor,
            endImageUrl: clip.endFrameUrl ?? undefined,
            projectId,
            characterIds: clip.characterIds,
            locationId: clip.locationId,
            characterLora: loras.characterLora,
            styleLora: loras.styleLora,
            camera: {
              angle: clip.cameraAngle ?? undefined,
              movement: clip.cameraMove ?? undefined,
              shotSize: clip.shotSize ?? undefined,
              lens: clip.lensFeel ?? undefined,
              speed: clip.cameraSpeed ?? undefined,
            },
            genrePresetId: clip.genrePresetId || projectRow?.genrePresetId || undefined,
            jobId,
            shotIndex: card.shotNumber - 1,
            generationMode: mode,
            resolution: manual ? undefined : tierPolicy.resolution,
            onSubmission: async (submission) => {
              await db.studioClip.update({
                where: { id: clipId },
                data: {
                  falRequestId: submission.requestId,
                  falSubmission: serializeFalSubmission(submission),
                },
              })
            },
            onSubProgress: (s) => {
              void appendJobProgressEvent(
                jobId,
                { phase: 'generating', status: 'running', detail: s.message, pct: 10 + Math.round(s.pct * 0.8) },
                { progressPct: 10 + Math.round(s.pct * 0.8) },
              )
            },
          })
        })(),
        getModelTimeout(assignedModel),
        `Shot ${card.shotNumber}`,
      ),
    )

    if (!videoUrl?.trim()) {
      throw new Error(`shot ${clipId}: provider returned no videoUrl`)
    }

    providerUrl = videoUrl
    const finalVideoUrl = providerUrl

    let lastFrame = ''
    try {
      lastFrame = (await extractTailFrame(finalVideoUrl)) ?? ''
    } catch (extractErr) {
      console.warn('[shot-generate] last_frame_extract_failed', {
        clipId,
        jobId,
        error: extractErr instanceof Error ? extractErr.message : String(extractErr),
      })
    }
    if (!lastFrame) {
      console.warn('[shot-generate] last_frame_extract_failed', {
        clipId,
        jobId,
        note: 'Next shot will advance without auto anchor — user can upload or generate one',
      })
    }

    await persistCompletedClip(clipId, projectId, finalVideoUrl, lastFrame || null, providerUrl)
    completed = true

    try {
      const { inspectCompletedShot } = await import('@/lib/diagnostics/inspectQuality')
      await inspectCompletedShot({
        frameUrl: lastFrame || finalVideoUrl,
        lastFrame: lastFrame || undefined,
        videoUrl: finalVideoUrl,
        shotId: clipId,
        userId: input.userId,
        jobId,
        projectId,
        model: assignedModel,
        purpose: clip.purpose ?? card.purpose ?? undefined,
        mode: clip.delegatedMode ?? undefined,
        prompt,
        characterIds: clip.characterIds,
        cameraIntent: clip.cameraMove ?? undefined,
        locationId: clip.locationId,
        hasFaces: Boolean(clip.characterIds.length),
      })
    } catch (qualityErr) {
      console.warn('[quality] inspect skipped', qualityErr instanceof Error ? qualityErr.message : qualityErr)
    }

    const detail = JSON.stringify({
      shotId: clipId,
      videoUrl: finalVideoUrl,
      lastFrame,
      durationSec: clip.duration,
      shotNumber: card.shotNumber,
    })

    await appendJobProgressEvent(
      jobId,
      { phase: `shot_${card.shotNumber}_complete`, status: 'completed', detail, pct: 100 },
      {
        status: 'COMPLETE',
        progressPct: 100,
        outputUrl: finalVideoUrl,
        completedAt: new Date(),
        statusMessage: `Shot ${card.shotNumber} complete`,
      },
    )
  } catch (err) {
    if (isGenerationPausedError(err)) {
      console.warn('generation_paused_blocked', { jobId, clipId, message: err instanceof Error ? err.message : err })
      await db.studioClip.update({
        where: { id: clipId },
        data: {
          status: 'AWAITING_DIRECTION',
          generatingAt: null,
          generateClaimJobId: null,
          generateClaimedBy: null,
          generateClaimedAt: null,
        },
      }).catch((writeErr) => {
        logCaught('clip_reset_failed', writeErr, { jobId, stage: 'generation_paused' })
        throw writeErr
      })
      await appendJobProgressEvent(
        jobId,
        { phase: 'cancelled', status: 'paused', detail: err instanceof Error ? err.message : String(err) },
        { status: 'FAILED', errorMessage: 'Generation paused (GENERATION_PAUSED)' },
      )
      return
    }
    if (completed) return
    if (providerUrl.trim()) {
      await persistCompletedClip(clipId, projectId, providerUrl).catch((persistErr) => {
        console.warn('[shot-generate] completion write failed', persistErr instanceof Error ? persistErr.message : persistErr)
      })
      return
    }
    const { recoverOutstandingFalClips } = await import('@/lib/studio/recoverFalClip')
    const recovered = await recoverOutstandingFalClips(projectId).catch((err) => {
      console.warn("[caught] src/lib/jobs/processShotGenerateJob.ts:538", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (0)
    })
    if (recovered > 0) return
    const msg = err instanceof Error ? err.message : String(err)
    const ctx = currentGen()
      const { captureGenerationError, extractFullError } = await import('@/lib/diagnostics/capture')
      const full = extractFullError(err)
      await captureGenerationError({
        err,
        rawError: full.raw || msg,
        httpStatus: full.httpStatus,
        shotId: clipId,
        userId: input.userId,
        jobId,
        model: ctx.model,
        mode: ctx.mode,
        purpose: ctx.purpose,
        stage: ctx.stage ?? 'submit',
        endpoint: ctx.endpoint ?? 'generate',
        falRequestId: ctx.falRequestId,
        payloadSnapshot: ctx.payloadSnapshot,
        providerLogs: full.logs,
      })
    await db.studioClip.updateMany({
      where: {
        id: clipId,
        status: { notIn: ['COMPLETED', 'MANUAL'] },
        OR: [{ videoUrl: null }, { videoUrl: '' }],
      },
      data: {
        status: 'FAILED',
        generatingAt: null,
        generateClaimJobId: null,
        generateClaimedBy: null,
        generateClaimedAt: null,
      },
    }).catch((writeErr) => {
      // The generation error is rethrown below. This write is the clip status.
      logCaught('clip_status', writeErr, { jobId, stage: 'failed' })
    })
    await appendJobProgressEvent(
      jobId,
      { phase: 'failed', status: 'failed', detail: msg },
      { status: 'FAILED', errorMessage: msg },
    )
    await recordShotOutcome({
      userId: input.userId,
      shotId: clipId,
      jobId,
      signal: 'failed',
    }).catch((writeErr) => {
      // Taste learning must not replace the generation error rethrown below.
      logCaught('shot_outcome', writeErr, { jobId, stage: 'learn' })
    })
    throw err
  }
}
