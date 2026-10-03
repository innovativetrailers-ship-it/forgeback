/**
 * Server-side GENERATE job runner — used by BullMQ worker and Vercel inline `after()`.
 */
import { db } from '@/lib/db'
import { redis } from '@/lib/redis'
import { broadcastJobEvent } from '@/lib/queue/events'
import { refundCredits } from '@/lib/credits'
import { checkNSFW } from '@/lib/moderation/nsfw'
import { logApiUsage } from '@/lib/telemetry/rlhf'
import { captureGeneration } from '@/lib/telemetry/delta'
import { incrementRenderCount } from '@/lib/vault/lora-trigger'
import type { GenerateVideoOutput } from '@/lib/models/types'
import { resolveEngineModel, ASYNC_POLL_ENGINES } from '@/lib/jobs/workerEngineMap'
import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'
import { completeGenerateShot, failGenerateShot } from '@/lib/studio/recordGenerateShot'

const POLL_INTERVAL_MS = 4000
const JOB_TIMEOUT_MS = 25 * 60 * 1000

export interface ProcessGenerateInput {
  jobId: string
  userId: string
  projectId?: string
  type: string
  modelId?: string
  payload: Record<string, unknown>
}

function describeProviderError(err: unknown): string {
  if (err && typeof err === 'object') {
    const e = err as { status?: number; message?: string; body?: { detail?: unknown } }
    const detail = e.body?.detail
    const detailStr =
      typeof detail === 'string'
        ? detail
        : Array.isArray(detail)
          ? detail
              .map((d) => (d as { msg?: string; message?: string })?.msg ?? (d as { message?: string })?.message)
              .filter(Boolean)
              .join('; ')
          : ''
    if (/exhausted balance|user is locked/i.test(detailStr)) {
      return 'AI provider account is out of balance. Top up fal.ai billing to resume generation.'
    }
    if (detailStr) return detailStr
    if (e.message) return e.status ? `${e.message} (${e.status})` : e.message
  }
  return err instanceof Error ? err.message : 'Unknown error'
}

async function dispatchToModel(
  modelId: string,
  payload: Record<string, unknown>,
): Promise<GenerateVideoOutput> {
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  if (!prompt) throw new Error('Prompt is required for video generation')

  const startFrameUrl =
    (payload.startFrameUrl as string | undefined) ??
    (payload.imageUrl as string | undefined) ??
    (payload.image_url as string | undefined)

  const duration = Number(payload.duration ?? 5)
  const aspectRatio = (payload.aspectRatio as string | undefined) ?? '16:9'
  const quality = payload.quality as string | undefined
  const engineModel = resolveEngineModel(modelId)

  if (ASYNC_POLL_ENGINES.has(modelId) || ASYNC_POLL_ENGINES.has(engineModel)) {
    const aspect = aspectRatio as '16:9' | '9:16' | '1:1' | '4:3' | '21:9'
    const validInput = {
      prompt,
      negativePrompt: payload.negativePrompt as string | undefined,
      duration,
      aspectRatio: aspect,
      startFrameUrl,
      seed: payload.seed as number | undefined,
      quality,
    }
    if (engineModel === 'sora-2' || modelId === 'sora' || modelId === 'sora-2') {
      const m = await import('@/lib/models/sora')
      return m.generateVideo(validInput)
    }
    const m = await import('@/lib/providers/runway')
    return m.generateVideo(validInput)
  }

  const { submitEngineVideo } = await import('@/lib/jobs/submitEngineVideo')
  const result = await submitEngineVideo({
    model: engineModel,
    prompt,
    duration,
    aspectRatio,
    quality,
    imageUrl: startFrameUrl,
  })

  if (result.videoUrl) {
    return { jobId: result.jobId, status: 'complete', videoUrl: result.videoUrl }
  }
  return { jobId: result.jobId, status: 'processing' }
}

async function pollUntilComplete(
  modelId: string,
  externalJobId: string,
  internalJobId: string,
  startedAt: number,
): Promise<GenerateVideoOutput> {
  while (true) {
    if (Date.now() - startedAt > JOB_TIMEOUT_MS) {
      throw new Error('Job timed out after 25 minutes')
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    let result: GenerateVideoOutput

    if (modelId === 'runway' || modelId === 'runway-gen4') {
      const runway = await import('@/lib/providers/runway')
      result = await runway.pollStatus(externalJobId)
    } else if (modelId === 'sora' || modelId === 'sora-2') {
      const sora = await import('@/lib/models/sora')
      result = await sora.pollStatus(externalJobId)
    } else {
      result = { jobId: externalJobId, status: 'failed', error: `Unknown model for polling: ${modelId}` }
    }

    await broadcastJobEvent({
      jobId: internalJobId,
      status: 'processing',
      progress: result.status === 'processing' ? 50 : 0,
      message: `${modelId} processing…`,
    })
    await db.renderJob.update({
      where: { id: internalJobId },
      data: { progressPct: result.status === 'processing' ? 50 : 0 },
    })

    if (result.status === 'complete' || result.status === 'failed') return result
  }
}

export async function processGenerateJob(data: ProcessGenerateInput): Promise<void> {
  const { jobId, userId, modelId, payload, projectId } = data
  const modelName = modelId?.trim() || refuseSilentModelSwap(jobId, 'wan')
  const startedAt = Date.now()

  await db.renderJob.update({
    where: { id: jobId },
    data: { status: 'PROCESSING', progressPct: 5, statusMessage: 'Submitting to model…' },
  })
  await broadcastJobEvent({ jobId, status: 'processing', progress: 5, message: 'Submitting to model…' })

  const initial = await dispatchToModel(modelName, payload)
  if (initial.status === 'failed') {
    throw new Error(initial.error ?? 'Model submission failed')
  }

  const result =
    initial.status === 'complete' && initial.videoUrl
      ? initial
      : await pollUntilComplete(modelName, initial.jobId, jobId, startedAt)

  if (result.status === 'failed') {
    throw new Error(result.error ?? 'Model generation failed')
  }

  const providerUrl = result.videoUrl!
  const latencyMs = Date.now() - startedAt

  await broadcastJobEvent({ jobId, status: 'processing', progress: 75, message: 'Saving to vault…' })
  const { persistVideoToR2 } = await import('@/lib/storage/persistMedia')
  const { renderVideoKey, objectKeyFromStored } = await import('@/lib/storage/r2')
  const videoUrl = await persistVideoToR2(providerUrl, jobId, userId)
  const storageKey = objectKeyFromStored(videoUrl) ?? renderVideoKey(userId, jobId)

  await broadcastJobEvent({ jobId, status: 'processing', progress: 85, message: 'Running safety check…' })
  const moderation = await checkNSFW(videoUrl, 'video')
  if (!moderation.safe) {
    throw new Error('Content flagged by safety filter. Please revise your prompt.')
  }

  await redis.rpush(
    'das:queue',
    JSON.stringify({ jobId, videoUrl, projectId, userId, type: data.type }),
  )

  await db.renderJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETE',
      outputUrl: videoUrl,
      storageKey,
      progressPct: 100,
      processingMs: latencyMs,
      completedAt: new Date(),
      statusMessage: 'Complete',
    },
  })

  const studioClipId = typeof payload.studioClipId === 'string' ? payload.studioClipId : ''
  if (studioClipId) {
    await completeGenerateShot(studioClipId, videoUrl, providerUrl)
  }

  await Promise.allSettled([
    logApiUsage({
      provider: modelName,
      model: modelName,
      userId,
      jobId,
      costCents: 0,
      latencyMs,
      success: true,
    }),
    captureGeneration({
      userId,
      prompt: (payload.prompt as string) ?? '',
      modelUsed: modelName,
      outputUrl: videoUrl,
      inputPayload: payload,
    }),
  ])

  const characterId = payload.characterId as string | undefined
  if (characterId) {
    await incrementRenderCount(characterId)
  }

  await broadcastJobEvent({
    jobId,
    status: 'complete',
    progress: 100,
    message: 'Complete!',
    outputUrl: videoUrl,
  })
}

export async function processGenerateJobWithRefund(data: ProcessGenerateInput): Promise<void> {
  try {
    await processGenerateJob(data)
  } catch (err) {
    const message = describeProviderError(err)

    const renderJob = await db.renderJob.findUnique({
      where: { id: data.jobId },
      select: { creditsCharged: true },
    })

    if (renderJob?.creditsCharged) {
      await refundCredits(
        data.userId,
        renderJob.creditsCharged,
        `Refund for failed job ${data.jobId}: ${message}`,
      )
    }

    await db.renderJob.update({
      where: { id: data.jobId },
      data: {
        status: 'FAILED',
        errorMessage: message,
        completedAt: new Date(),
        statusMessage: 'Generation failed',
      },
    })

    await broadcastJobEvent({ jobId: data.jobId, status: 'failed', error: message })
    const studioClipId = typeof data.payload.studioClipId === 'string' ? data.payload.studioClipId : ''
    const { captureGenerationError } = await import('@/lib/diagnostics/capture')
    const model = typeof data.payload.model === 'string' ? data.payload.model : 'legacy-generate'
    await captureGenerationError({
      err,
      rawError: message,
      userId: data.userId,
      jobId: data.jobId,
      shotId: studioClipId || undefined,
      stage: 'submit',
      endpoint: 'generate',
      model,
    })
    await failGenerateShot(studioClipId)

    await logApiUsage({
      provider: data.modelId ?? 'unknown',
      model: data.modelId ?? 'unknown',
      userId: data.userId,
      jobId: data.jobId,
      costCents: 0,
      latencyMs: 0,
      success: false,
    })

    throw err
  }
}
