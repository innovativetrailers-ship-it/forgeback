import { logCaught } from '@/lib/diagnostics/caught'
// Suppress expected teardown errors that fire when Redis/BullMQ connections
// close in non-deterministic order during graceful shutdown.
const TEARDOWN_MSGS = ['Connection is closed', "stream isn't writeable", 'ECONNRESET']
process.on('uncaughtException', (err) => {
  if (TEARDOWN_MSGS.some((m) => err.message?.includes(m))) return
  console.error('[render-worker] Uncaught exception:', err)
  void import('@/lib/diagnostics/captureCode').then(({ captureCodeError }) =>
    captureCodeError({ err, source: 'worker.render.uncaughtException' }),
  )
  process.exit(1)
})
process.on('unhandledRejection', (reason) => {
  const msg = (reason as Error)?.message ?? String(reason)
  if (TEARDOWN_MSGS.some((m) => msg.includes(m))) return
  console.error('[render-worker] Unhandled rejection:', reason)
  void import('@/lib/diagnostics/captureCode').then(({ captureCodeError }) =>
    captureCodeError({ err: reason, source: 'worker.render.unhandledRejection' }),
  )
})

import { UnrecoverableError, Worker } from 'bullmq'
import { Queue } from 'bullmq'
import { redis, bullmqRedis, bullMQPrefix } from '../../redis'
import { startHeartbeat } from '../heartbeat'
import { RENDER_QUEUE_NAME } from '../names'
import { db } from '../../db'
import { broadcastJobEvent } from '../events'
import { refundCredits } from '../../credits'
import { releaseHold } from '../../credits/escrow'
import { checkNSFW } from '../../moderation/nsfw'
import { logApiUsage, logRLHFSelection } from '../../telemetry/rlhf'
import { captureGeneration } from '../../telemetry/delta'
import { incrementRenderCount } from '../../vault/lora-trigger'
import { refuseSilentModelSwap } from '../../orchestration/costGuard'
import type { GenerateVideoOutput } from '../../models/types'
import { startShotWatchdog } from '../../studio/watchdog'
import { drainRenderQueueIfPaused } from '../drainRenderQueue'
import { isGenerationPaused, isGenerationPausedError } from '../../generation/pause'
import { withGenContext } from '../../diagnostics/correlation'

function isNonRetryableProviderError(err: unknown): boolean {
  if (err instanceof Error && err.name === 'FalValidationError') return true
  const status = typeof err === 'object' && err && 'status' in err ? Number((err as { status: number }).status) : NaN
  if (Number.isFinite(status) && status >= 400 && status < 500) return true
  const message = err instanceof Error ? err.message : String(err)
  return /\b422\b|\b4\d\d\b|validation error|unprocessable/i.test(message)
}

const BILLABLE_JOB_NAMES = new Set([
  'orchestrate',
  'shot-generate',
  'scene-generate',
  'render-simple',
  'relay-generate',
])

async function skipIfGenerationPaused(
  jobName: string,
  jobId?: string,
): Promise<boolean> {
  if (!BILLABLE_JOB_NAMES.has(jobName) && jobName !== 'legacy-generate') return false
  if (!isGenerationPaused()) return false
  console.warn('generation_paused_skip', { jobName, jobId })
  if (jobId) {
    await db.renderJob.update({
      where: { id: jobId },
      data: { status: 'FAILED', errorMessage: 'Generation paused (GENERATION_PAUSED)' },
    }).catch((err) => {
      logCaught('pause_mark_failed', err, { jobId, stage: 'generation_paused' })
      throw err
    })
    await releaseHold(jobId).catch((err) => {
      logCaught('pause_release_hold', err, { jobId, stage: 'generation_paused' })
      throw err
    })
  }
  throw new UnrecoverableError('Generation paused (GENERATION_PAUSED)')
}

const POLL_INTERVAL_MS = 4000
// fal video models can sit in-queue for 15+ min under load before execution.
// Keep this comfortably above observed worst-case so we don't fail jobs that
// fal will still complete (the result is fetched as soon as it flips COMPLETED).
const JOB_TIMEOUT_MS = 25 * 60 * 1000 // 25 minutes

// fal.ai (and other providers) throw errors whose useful text lives in
// `body.detail` rather than `message` (which is just "Forbidden"/"Bad Request").
// Extract a user-facing message and give the common balance-lock a clear copy.
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

type JobType =
  | 'GENERATE'
  | 'REPAINT'
  | 'RELIGHT'
  | 'UPSCALE'
  | 'EXPORT'
  | 'LORA_TRAIN'
  | 'LIPSYNC'
  | 'AUTO_SOCIAL'
  | 'TRANSCRIBE'
  | 'CGI_INSERT'

interface RenderJobPayload {
  jobId: string
  userId: string
  projectId?: string
  type: JobType
  modelId?: string
  payload: Record<string, unknown>
}

async function dispatchToModel(
  rawModelId: string,
  payload: Record<string, unknown>
): Promise<GenerateVideoOutput> {
  const { normaliseModelId } = await import('../../models/normaliseId')
  const modelId = normaliseModelId(rawModelId)
  const prompt = typeof payload.prompt === 'string' ? payload.prompt.trim() : ''
  if (!prompt) {
    throw new Error('Prompt is required for video generation')
  }

  const startFrameUrl =
    (payload.startFrameUrl as string | undefined) ??
    (payload.imageUrl as string | undefined) ??
    (payload.image_url as string | undefined)

  const duration = Number(payload.duration ?? 5)
  const aspectRatio = (payload.aspectRatio as string | undefined) ?? '16:9'
  const quality = payload.quality as string | undefined

  const { resolveEngineModel, ASYNC_POLL_ENGINES } = await import('../../jobs/workerEngineMap')
  const engineModel = resolveEngineModel(modelId)

  // Runway + Sora submit async provider jobs — keep dedicated clients for poll loops.
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
      const m = await import('../../models/sora')
      return m.generateVideo(validInput)
    }
    const m = await import('../../providers/runway')
    return m.generateVideo(validInput)
  }

  const { submitEngineVideo } = await import('../../jobs/submitEngineVideo')
  const result = await submitEngineVideo({
    model: engineModel,
    prompt,
    duration,
    aspectRatio,
    quality,
    imageUrl: startFrameUrl,
  })

  if (result.videoUrl) {
    return {
      jobId: result.jobId,
      status: 'complete',
      videoUrl: result.videoUrl,
    }
  }

  return { jobId: result.jobId, status: 'processing' }
}

async function pollUntilComplete(
  modelId: string,
  externalJobId: string,
  internalJobId: string,
  startedAt: number,
  pollUrl?: string,
): Promise<GenerateVideoOutput> {
  while (true) {
    if (Date.now() - startedAt > JOB_TIMEOUT_MS) {
      throw new Error('Job timed out after 25 minutes')
    }

    await new Promise((resolve) => setTimeout(resolve, POLL_INTERVAL_MS))

    let result: GenerateVideoOutput

    switch (modelId) {
      case 'kling_standard':
      case 'kling':
      case 'kling-3.0':
      case 'kling-o3': {
        const kling = await import('../../models/kling')
        result = await kling.pollStatus(externalJobId, modelId === 'kling_standard' || modelId === 'kling' ? 'standard' : 'pro')
        break
      }
      case 'kling_pro': {
        const kling = await import('../../models/kling')
        result = await kling.pollStatus(externalJobId, 'pro')
        break
      }
      case 'veo3':
      case 'veo-3.1': {
        const veo3 = await import('../../models/veo3')
        result = await veo3.pollStatus(externalJobId, pollUrl)
        break
      }
      case 'luma':
      case 'luma-ray3': {
        const luma = await import('../../models/luma')
        result = await luma.pollStatus(externalJobId)
        break
      }
      case 'runway':
      case 'runway-gen4': {
        const runway = await import('../../providers/runway')
        result = await runway.pollStatus(externalJobId)
        break
      }
      case 'pika':
      case 'pika-2.5': {
        const pika = await import('../../models/pika')
        result = await pika.pollStatus(externalJobId)
        break
      }
      case 'minimax':
      case 'minimax-2.3': {
        const minimax = await import('../../models/minimax')
        result = await minimax.pollStatus(externalJobId)
        break
      }
      case 'seedance':
      case 'seedance-2.0': {
        const seedance = await import('../../models/seedance')
        result = await seedance.pollStatus(externalJobId)
        break
      }
      case 'skyreels':
      case 'skyreels-v3': {
        const skyreels = await import('../../models/skyreels')
        result = await skyreels.pollStatus(externalJobId)
        break
      }
      case 'ltx':
      case 'ltx-2.3':
      case 'ltx-2.3-fast':
      case 'animatediff': {
        const ltx = await import('../../models/ltx')
        result = await ltx.pollStatus(externalJobId)
        break
      }
      case 'pixverse':
      case 'pixverse-c1':
      case 'pixverse-v6': {
        const pixverse = await import('../../models/pixverse')
        result = await pixverse.pollStatus(externalJobId)
        break
      }
      case 'hunyuan':
      case 'hunyuan-video':
      case 'hunyuan-video-1.5':
      case 'hunyuan-hy-motion': {
        const hunyuan = await import('../../models/hunyuan')
        result = await hunyuan.pollStatus(externalJobId, false, pollUrl)
        break
      }
      case 'happyhorse':
      case 'happyhorse-1.0': {
        const happyhorse = await import('../../models/happyhorse')
        result = await happyhorse.pollStatus(externalJobId)
        break
      }
      case 'hailuo':
      case 'hailuo-2.3': {
        const hailuo = await import('../../models/hailuo')
        result = await hailuo.pollStatus(externalJobId)
        break
      }
      case 'grok_video':
      case 'grok-imagine-video': {
        const grok = await import('../../providers/grok')
        result = await grok.pollStatus(externalJobId)
        break
      }
      case 'sora':
      case 'sora-2': {
        const sora = await import('../../models/sora')
        result = await sora.pollStatus(externalJobId)
        break
      }
      case 'wan':
      case 'wan-2.2':
      case 'wan-2.6': {
        const wan = await import('../../models/wan')
        const stored = (await db.renderJob.findUnique({
          where: { id: internalJobId },
          select: { inputPayload: true },
        }))?.inputPayload as { startFrameUrl?: string; image_url?: string; imageUrl?: string } | undefined
        const i2v = Boolean(stored?.startFrameUrl ?? stored?.image_url ?? stored?.imageUrl)
        const { WAN_I2V_MODEL, WAN_T2V_MODEL } = await import('../../models/wan')
        result = await wan.pollStatus(externalJobId, i2v ? WAN_I2V_MODEL : WAN_T2V_MODEL)
        break
      }
      default:
        throw new Error(`Unknown model ${modelId}. Nothing was submitted as a substitute.`)
    }

    // Broadcast progress
    const progress = result.status === 'processing' ? 50 : 0
    await broadcastJobEvent({
      jobId: internalJobId,
      status: 'processing',
      progress,
      message: `${modelId} processing…`,
    })

    await db.renderJob.update({
      where: { id: internalJobId },
      data: { progressPct: progress },
    })

    if (result.status === 'complete' || result.status === 'failed') {
      return result
    }
  }
}

async function handleGenerateJob(data: RenderJobPayload): Promise<void> {
  const { jobId, userId, modelId, payload } = data
  const modelName = modelId?.trim() || refuseSilentModelSwap(jobId, 'wan')
  const startedAt = Date.now()

  // Dispatch to model
  await broadcastJobEvent({ jobId, status: 'processing', progress: 5, message: 'Submitting to model…' })

  const initial = await dispatchToModel(modelName, payload)

  if (initial.status === 'failed') {
    throw new Error(initial.error ?? 'Model submission failed')
  }

  const result =
    initial.status === 'complete' && initial.videoUrl
      ? initial
      : await pollUntilComplete(modelName, initial.jobId, jobId, startedAt, initial.pollUrl)

  if (result.status === 'failed') {
    throw new Error(result.error ?? 'Model generation failed')
  }
  const providerUrl = result.videoUrl!
  const latencyMs = Date.now() - startedAt

  await broadcastJobEvent({ jobId, status: 'processing', progress: 75, message: 'Saving to vault…' })
  const { persistVideoToR2 } = await import('../../storage/persistMedia')
  const { renderVideoKey, objectKeyFromStored } = await import('../../storage/r2')
  const videoUrl = await persistVideoToR2(providerUrl, jobId, userId)
  const storageKey = objectKeyFromStored(videoUrl) ?? renderVideoKey(userId, jobId)

  // Content moderation check
  await broadcastJobEvent({ jobId, status: 'processing', progress: 85, message: 'Running safety check…' })
  const moderation = await checkNSFW(videoUrl, 'video')

  if (!moderation.safe) {
    throw new Error('Content flagged by safety filter. Please revise your prompt.')
  }

  // Queue for DAS ingestion
  await redis.rpush(
    'das:queue',
    JSON.stringify({ jobId, videoUrl, projectId: data.projectId, userId, type: data.type })
  )

  // Update DB
  await db.renderJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETE',
      outputUrl: videoUrl,
      storageKey,
      progressPct: 100,
      processingMs: latencyMs,
      completedAt: new Date(),
    },
  })

  // Telemetry
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

  // LoRA auto-trigger if character was used
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

async function handleTranscribeJob(data: RenderJobPayload): Promise<void> {
  const { jobId, userId, payload } = data
  const audioUrl = payload.audioUrl as string

  await broadcastJobEvent({ jobId, status: 'processing', progress: 20, message: 'Transcribing…' })

  const { transcribeAudio } = await import('../../fal/sync')
  const result = await transcribeAudio(audioUrl)

  await db.renderJob.update({
    where: { id: jobId },
    data: {
      status: 'COMPLETE',
      outputUrl: audioUrl,
      progressPct: 100,
      completedAt: new Date(),
    },
  })

  await broadcastJobEvent({
    jobId,
    status: 'complete',
    progress: 100,
    outputUrl: audioUrl,
    message: result.text.slice(0, 100),
  })

  // Silence unused var warning
  void userId
}

function maskUrl(url: string | undefined): string {
  if (!url) return 'unset'
  try {
    const u = new URL(url)
    return `${u.protocol}//${u.hostname}:${u.port || 'default'}`
  } catch (err) {
    console.warn("[caught] src/lib/queue/workers/render.worker.ts:476", err instanceof Error ? { name: err.name, message: err.message } : err)

    return 'invalid'
  }
}

async function withBootTimeout<T>(
  name: string,
  ms: number,
  fn: () => Promise<T>,
  results: Record<string, string>,
): Promise<void> {
  try {
    await Promise.race([
      fn(),
      new Promise<never>((_, reject) =>
        setTimeout(() => reject(new Error(`${name} timeout after ${ms}ms`)), ms),
      ),
    ])
    results[name] = 'ok'
  } catch (err) {
    console.warn("[caught] src/lib/queue/workers/render.worker.ts:495", err instanceof Error ? { name: err.name, message: err.message } : err)

    results[name] = err instanceof Error ? err.message : String(err)
  }
}

async function bootSelfTest(): Promise<void> {
  const results: Record<string, string> = {}

  await withBootTimeout('redis', 8_000, async () => {
    await new Promise<void>((resolve, reject) => {
      if (bullmqRedis.status === 'ready') {
        resolve()
        return
      }
      const onReady = () => { cleanup(); resolve() }
      const onError = (err: Error) => { cleanup(); reject(err) }
      const timer = setTimeout(() => { cleanup(); reject(new Error('redis ready timeout')) }, 7_000)
      const cleanup = () => {
        clearTimeout(timer)
        bullmqRedis.off('ready', onReady)
        bullmqRedis.off('error', onError)
      }
      bullmqRedis.once('ready', onReady)
      bullmqRedis.once('error', onError)
    })
    const pong = await bullmqRedis.ping()
    if (pong !== 'PONG') throw new Error(`unexpected ping response: ${pong}`)
  }, results)

  await withBootTimeout('database', 8_000, async () => {
    await db.$queryRaw`SELECT 1`
  }, results)

  await withBootTimeout('fal_auth', 8_000, async () => {
    const { hasFalKey } = await import('@/lib/config/keys')
    if (!hasFalKey()) throw new Error('FAL_KEY not set on THIS service')
  }, results)

  console.log('[worker_boot_selftest]', JSON.stringify(results))
  if (Object.values(results).some((v) => v !== 'ok')) {
    console.error('[worker_boot_FAILED — exiting so Railway restarts + alerts]', JSON.stringify(results))
    process.exit(1)
  }

  const dbUrl = process.env.WORKER_DATABASE_URL ?? process.env.DATABASE_URL ?? ''
  if (!dbUrl.includes('connection_limit') && !dbUrl.includes('pgbouncer')) {
    console.warn('[worker_boot] DATABASE_URL missing pgbouncer/connection_limit — set WORKER_DATABASE_URL with ?pgbouncer=true&connection_limit=5&pool_timeout=10')
  }
}

function startEndpointProbeBanner(): void {
  void (async () => {
    try {
      const { listRegistryVideoEndpoints } = await import('@/lib/fal/registryProbe')
      const endpoints = listRegistryVideoEndpoints()
      const rows: Array<{ id: string; ok: boolean }> = []

      for (const entry of endpoints) {
        try {
          const res = await fetch(
            `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(entry.endpoint)}`,
            { signal: AbortSignal.timeout(15_000) },
          )
          rows.push({ id: entry.endpoint, ok: res.ok })
        } catch (err) {
          console.warn("[caught] src/lib/queue/workers/render.worker.ts:559", err instanceof Error ? { name: err.name, message: err.message } : err)

          rows.push({ id: entry.endpoint, ok: false })
        }
        await new Promise((r) => setTimeout(r, 80))
      }

      const alive = rows.filter((r) => r.ok).map((r) => r.id)
      const dead = rows.filter((r) => !r.ok).map((r) => r.id)
      console.log('endpoint_health', JSON.stringify({
        alive: alive.length,
        dead,
        total: rows.length,
        source: 'openapi_schema_fetch',
      }))
    } catch (err) {
      console.warn('[endpoint_probe_error]', err instanceof Error ? err.message : err)
    }
  })()
}

const workerProcessor = async (job: { name: string; data: RenderJobPayload; id?: string }) => {
    const data = job.data

    // ── V2: orchestrate / render-simple job names ───────────────────────────
    if (job.name === 'orchestrate') {
      const {
        jobId, userId, duration, selectedModels, creditCost, useCognition,
        fccCognitionContext, projectId, generationMode, source, qualityTier,
      } = data as unknown as {
        jobId: string; userId: string; prompt?: string; script?: string
        duration: number; selectedModels?: string[]; creditCost?: number; useCognition?: boolean
        fccCognitionContext?: { name: string; behavioralPrompt?: string; wardrobeSummary?: string; appearanceSummary?: string }
        projectId?: string; generationMode?: 'draft' | 'production'; source?: string
        qualityTier?: string
      }
      if (await skipIfGenerationPaused('orchestrate', jobId)) return
      const { resolveOrchestrationScript } = await import('@/lib/jobs/resolveOrchestrationScript')
      const prompt = await resolveOrchestrationScript(jobId, data as { prompt?: string; script?: string })
      console.log('[orchestrate] Received job payload:', {
        prompt: prompt.slice(0, 100),
        jobId,
        source: source ?? 'unknown',
      })
      let councilModels = selectedModels ?? []
      if (!councilModels.length) {
        const row = await db.renderJob.findUnique({
          where: { id: jobId },
          select: { metadata: true },
        })
        const meta = row?.metadata as { selectedModels?: string[] } | null
        councilModels = meta?.selectedModels ?? []
      }
      const { processOrchestrateJobWithRefund } = await import('@/lib/jobs/processOrchestrateJob')
      await processOrchestrateJobWithRefund({
        jobId, userId, prompt, duration, selectedModels: councilModels, creditCost,
        useCognition, fccCognitionContext, projectId, generationMode, source, qualityTier,
      })
      return
    }

    if (job.name === 'library-copy') {
      const { userId, projectId } = data as unknown as { userId?: string; projectId?: string }
      if (!userId) return
      const { retryPendingLibraryCopies } = await import('@/lib/studio/batchClipSync')
      const left = await retryPendingLibraryCopies(userId, projectId)
      if (left > 0) throw new Error(`pending library copies remain: ${left}`)
      return
    }

    if (job.name === 'audio-generate') {
      const { trackId } = data as unknown as { trackId: string }
      const { processAudioTrackJob } = await import('@/lib/jobs/processAudioTrackJob')
      await processAudioTrackJob(trackId)
      return
    }

    if (job.name === 'multi-engine') {
      const segments = data.payload.segments
      if (!Array.isArray(segments) || segments.length === 0) {
        throw new Error('Multi-engine job is missing segments')
      }
      if (await skipIfGenerationPaused('multi-engine', data.jobId)) return
      const { processMultiEngineJob } = await import('@/lib/jobs/processMultiEngineJob')
      const studioClipId = typeof data.payload.studioClipId === 'string' ? data.payload.studioClipId : undefined
      await processMultiEngineJob({
        jobId: data.jobId,
        segments: segments as import('@/lib/routing/types').SceneSegment[],
        studioClipId,
      })
      return
    }

    if (job.name === 'shot-generate') {
      const { jobId, userId, projectId, clipId, prompt, anchorFrameUrl, modelOverride, mode, qualityTier } = data as unknown as {
        jobId: string; userId: string; projectId: string; clipId: string
        prompt?: string; anchorFrameUrl?: string; modelOverride?: string | null; mode?: 'draft' | 'production'
        qualityTier?: string
      }
      if (await skipIfGenerationPaused('shot-generate', jobId)) {
        await db.studioClip.update({
          where: { id: clipId },
          data: { status: 'AWAITING_DIRECTION', generatingAt: null },
        }).catch((err) => {
          logCaught('clip_reset_failed', err, { jobId, stage: 'shot-generate' })
          throw err
        })
        return
      }
      const { processShotGenerateJob } = await import('@/lib/jobs/processShotGenerateJob')
      try {
        await processShotGenerateJob({ jobId, userId, projectId, clipId, prompt, anchorFrameUrl, modelOverride, mode, qualityTier })
      } catch (err) {
        if (isNonRetryableProviderError(err)) {
          throw new UnrecoverableError(err instanceof Error ? err.message : String(err))
        }
        throw err
      }
      return
    }

    if (job.name === 'scene-generate') {
      const {
        jobId, userId, projectId, sceneId, sceneNumber, isFirstScene,
        crossSceneAnchor, selectedModels, mode,
      } = data as unknown as {
        jobId: string; userId: string; projectId: string; sceneId: string
        sceneNumber: number; isFirstScene: boolean; crossSceneAnchor?: string
        selectedModels: string[]; mode?: 'draft' | 'production'
      }
      const { processSceneGenerateJob } = await import('@/lib/jobs/processSceneGenerateJob')
      if (await skipIfGenerationPaused('scene-generate', jobId)) return
      await processSceneGenerateJob({
        jobId, userId, projectId, sceneId, sceneNumber, isFirstScene,
        crossSceneAnchor, selectedModels, mode: mode ?? 'draft',
      })
      return
    }

    if (job.name === 'relay-generate') {
      const { jobId } = data as unknown as { jobId: string }
      if (await skipIfGenerationPaused('relay-generate', jobId)) return
      const { dispatchRelayJob } = await import('@/lib/desktop/generateRelay')
      await dispatchRelayJob(jobId)
      return
    }

    if (job.name === 'render-simple') {
      const { jobId, prompt, duration, engine, userId } = data as unknown as {
        jobId: string; prompt: string; duration: number; engine: string; userId: string
      }
      const { processRenderSimpleJob } = await import('@/lib/jobs/processOrchestrateJob')
      if (await skipIfGenerationPaused('render-simple', jobId)) return
      await processRenderSimpleJob({ jobId, userId, prompt, duration, engine })
      return
    }

    if (job.name === 'music') {
      const { jobId, userId: uid, prompt, style, durationSecs, instrumental, title } = data as unknown as {
        jobId: string; userId: string; prompt: string; style?: string
        durationSecs?: number; instrumental?: boolean; title?: string
      }
      const startTime = Date.now()
      await db.renderJob.update({ where: { id: jobId }, data: { status: 'PROCESSING', progressPct: 5, statusMessage: 'Suno composing…' } })
      try {
        const { generateMusicWithProgress } = await import('@/lib/engines/suno')
        const result = await generateMusicWithProgress(
          { prompt, style, duration: durationSecs, instrumental, title },
          async (pct, message) => {
            const elapsed    = (Date.now() - startTime) / 1000
            const etaSeconds = pct > 5 ? Math.max(0, Math.round((elapsed / pct) * (100 - pct))) : null
            await db.renderJob.update({
              where: { id: jobId },
              data: { progressPct: pct, statusMessage: message, ...(etaSeconds !== null ? { etaSeconds } : {}) },
            }).catch((err) => {
              // Progress text is optional. Music generation continues.
              logCaught('progress', err, { jobId, stage: 'music' })
            })
          }
        )
        const { uploadToR2 } = await import('@/lib/storage/r2')
        const buf    = await fetch(result.audioUrl).then(r => r.arrayBuffer())
        const r2Url  = await uploadToR2(Buffer.from(buf), `music/${uid}/${Date.now()}.mp3`, 'audio/mpeg')
        await db.renderJob.update({
          where: { id: jobId },
          data: { status: 'COMPLETE', progressPct: 100, etaSeconds: 0, statusMessage: 'Complete', outputUrl: r2Url, completedAt: new Date() },
        })
      } catch (err) {
        const msg = describeProviderError(err)
        await db.renderJob.update({ where: { id: jobId }, data: { status: 'FAILED', errorMessage: msg, statusMessage: 'Music generation failed' } })
        throw err
      }
      return
    }

    if (job.name === 'voice') {
      const { jobId, userId: uid, text, voiceId, stability, similarity } = data as unknown as {
        jobId: string; userId: string; text: string; voiceId?: string; stability?: number; similarity?: number
      }
      await db.renderJob.update({ where: { id: jobId }, data: { status: 'PROCESSING', progressPct: 10, statusMessage: 'Synthesising voice…' } })
      try {
        const sentences = text.match(/[^.!?]+[.!?]+/g) ?? [text]
        const total     = sentences.length
        const parts: Buffer[] = []
        for (let i = 0; i < sentences.length; i++) {
          const { synthesiseVoice } = await import('@/lib/engines/elevenLabs')
          const buf = await synthesiseVoice({ text: sentences[i].trim(), voiceId, stability, similarity })
          parts.push(buf)
          const pct = Math.round(((i + 1) / total) * 90)
          await db.renderJob.update({
            where: { id: jobId },
            data: { progressPct: pct, statusMessage: `Synthesising voice ${i + 1}/${total}` },
          }).catch((err) => {
            // Progress text is optional. Voice synthesis continues.
            logCaught('progress', err, { jobId, stage: 'voice' })
          })
        }
        const combined = Buffer.concat(parts)
        const { uploadToR2 } = await import('@/lib/storage/r2')
        const r2Url = await uploadToR2(combined, `audio/${uid}/${Date.now()}.mp3`, 'audio/mpeg')
        await db.renderJob.update({
          where: { id: jobId },
          data: { status: 'COMPLETE', progressPct: 100, etaSeconds: 0, statusMessage: 'Complete', outputUrl: r2Url, completedAt: new Date() },
        })
      } catch (err) {
        const msg = describeProviderError(err)
        await db.renderJob.update({ where: { id: jobId }, data: { status: 'FAILED', errorMessage: msg, statusMessage: 'Voice synthesis failed' } })
        throw err
      }
      return
    }

    // ── Legacy GENERATE / REPAINT / TRANSCRIBE jobs ─────────────────────────
    if (data.type === 'GENERATE' || data.type === 'REPAINT') {
      if (await skipIfGenerationPaused('legacy-generate', data.jobId)) return
    }

    // Mark processing in DB
    await db.renderJob.update({
      where: { id: data.jobId },
      data: { status: 'PROCESSING' },
    })

    await broadcastJobEvent({
      jobId: data.jobId,
      status: 'processing',
      progress: 2,
      message: 'Job started…',
    })

    try {
      switch (data.type) {
        case 'GENERATE':
        case 'REPAINT':
          console.log('[simple-generate] worker picked up', {
            jobId: data.jobId,
            model: data.modelId ?? null,
            shotId: typeof data.payload.studioClipId === 'string' ? data.payload.studioClipId : null,
          })
          await withGenContext({
            jobId: data.jobId,
            userId: data.userId,
            model: data.modelId,
            shotId: typeof data.payload.studioClipId === 'string' ? data.payload.studioClipId : undefined,
            source: 'simple.generate',
            stage: 'submit',
          }, () => handleGenerateJob(data))
          break
        case 'TRANSCRIBE':
          await handleTranscribeJob(data)
          break
        default:
          throw new UnrecoverableError(`No handler for render job ${job.name || data.type || 'unknown'}`)
      }
    } catch (err) {
      if (isGenerationPausedError(err)) {
        console.warn('generation_paused_blocked', { jobId: data.jobId, message: err instanceof Error ? err.message : err })
        await db.renderJob.update({
          where: { id: data.jobId },
          data: { status: 'FAILED', errorMessage: 'Generation paused (GENERATION_PAUSED)' },
        }).catch((writeErr) => {
          logCaught('pause_mark_failed', writeErr, { jobId: data.jobId, stage: 'generation_paused' })
          throw writeErr
        })
        await releaseHold(data.jobId)
        throw new UnrecoverableError('Generation paused (GENERATION_PAUSED)')
      }
      const message = describeProviderError(err)

      // Refund credits
      const renderJob = await db.renderJob.findUnique({
        where: { id: data.jobId },
        select: { creditsCharged: true },
      })

      if (renderJob?.creditsCharged) {
        await refundCredits(
          data.userId,
          renderJob.creditsCharged,
          `Refund for failed job ${data.jobId}: ${message}`
        )
      }
      await releaseHold(data.jobId)

      await db.renderJob.update({
        where: { id: data.jobId },
        data: {
          status: 'FAILED',
          errorMessage: message,
          completedAt: new Date(),
        },
      })

      await broadcastJobEvent({
        jobId: data.jobId,
        status: 'failed',
        error: message,
      })

      await logApiUsage({
        provider: data.modelId ?? 'unknown',
        model: data.modelId ?? 'unknown',
        userId: data.userId,
        jobId: data.jobId,
        costCents: 0,
        latencyMs: 0,
        success: false,
      })

      const { captureGenerationError } = await import('@/lib/diagnostics/capture')
      await captureGenerationError({
        err,
        rawError: message,
        userId: data.userId,
        jobId: data.jobId,
        stage: 'submit',
        endpoint: 'render-worker',
        model: data.modelId ?? 'unknown',
      })

      if (isNonRetryableProviderError(err)) {
        throw new UnrecoverableError(message)
      }
      throw err
    }
}

const WORKER_OPTS = {
  connection: bullmqRedis,
  prefix: bullMQPrefix,
  concurrency: Number(process.env.RENDER_WORKER_CONCURRENCY ?? '1'),
  limiter: { max: 20, duration: 60000 },
  lockDuration:    10_800_000,
  lockRenewTime:   300_000,
  stalledInterval: 30_000,
  maxStalledCount: 1,
} as const

let renderWorker: Worker<RenderJobPayload> | null = null

async function startRenderWorker(): Promise<void> {
  if (!process.env.FAL_WEBHOOK_SECRET?.trim()) {
    throw new Error('FAL_WEBHOOK_SECRET is not set')
  }
  await bootSelfTest()

  console.log('[worker_generation_pause]', JSON.stringify({
    GENERATION_PAUSED: process.env.GENERATION_PAUSED,
    paused: isGenerationPaused(),
    RENDER_WORKER_CONCURRENCY: process.env.RENDER_WORKER_CONCURRENCY ?? '1',
  }))

  if (isGenerationPaused()) {
    await drainRenderQueueIfPaused(true)
  }

  console.log('[render_worker_online]', JSON.stringify({
    queue: RENDER_QUEUE_NAME,
    redis: maskUrl(process.env.REDIS_URL),
    pid: process.pid,
  }))

  startEndpointProbeBanner()

  renderWorker = new Worker<RenderJobPayload>(RENDER_QUEUE_NAME, workerProcessor, WORKER_OPTS)

  renderWorker.on('error', (e) => {
    console.error('[worker_error]', String(e))
  })

  renderWorker.on('failed', (job, err) => {
    const e = err as Error & { code?: string; meta?: unknown }
    console.error(
      `[render-worker] Job ${job?.id} failed: name=${e?.name} code=${e?.code ?? 'n/a'} msg=${e?.message}`,
    )
    if (e?.meta) console.error('[render-worker] meta:', JSON.stringify(e.meta))
    if (e?.stack) console.error('[render-worker] stack:', e.stack)
  })

  renderWorker.on('completed', (job) => {
    console.log(`[render-worker] Job ${job.id} completed`)
  })

  const depthQueue = new Queue(RENDER_QUEUE_NAME, {
    connection: bullmqRedis,
    prefix: bullMQPrefix,
  })
  setInterval(async () => {
    try {
      const counts = await depthQueue.getJobCounts('waiting', 'active', 'failed')
      console.log('[worker_heartbeat]', JSON.stringify(counts))
    } catch (e) {
      console.error('[worker_heartbeat_error]', String(e))
    }
  }, 30_000).unref()

  const stopWatchdog = startShotWatchdog()
  const stopRedisHeartbeat = startHeartbeat('render-worker')

  const shutdown = () => {
    stopWatchdog()
    stopRedisHeartbeat()
    void renderWorker?.close().finally(() => process.exit(0))
  }
  process.on('SIGTERM', shutdown)
  process.on('SIGINT', shutdown)
}

void startRenderWorker().catch((err) => {
  console.error('[render-worker] Boot failed:', err)
  process.exit(1)
})

export { renderWorker }

// Silence unused import
void logRLHFSelection
