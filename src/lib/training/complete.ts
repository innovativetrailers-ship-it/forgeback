import { logCaught } from '@/lib/diagnostics/caught'
import { db } from '@/lib/db'
import { captureGenerationError } from '@/lib/diagnostics/capture'
import { broadcastJobEvent } from '@/lib/queue/events'
import { promoteTrainingRunToAsset } from './assets'

function fileUrl(value: unknown): string | undefined {
  if (typeof value === 'string' && value.trim()) return value.trim()
  if (value && typeof value === 'object' && typeof (value as { url?: unknown }).url === 'string') {
    return (value as { url: string }).url.trim()
  }
  return undefined
}

export function loraUrlsFromResult(data: unknown): { loraUrl?: string; configUrl?: string } {
  if (!data || typeof data !== 'object') return {}
  let row = data as Record<string, unknown>
  const nested = row.payload
  if (
    nested &&
    typeof nested === 'object' &&
    !fileUrl(row.lora_file) &&
    !fileUrl(row.diffusers_lora_file)
  ) {
    row = nested as Record<string, unknown>
  }
  return {
    loraUrl:
      fileUrl(row.lora_file)
      ?? fileUrl(row.diffusers_lora_file)
      ?? fileUrl(row.loraFile),
    configUrl: fileUrl(row.config_file) ?? fileUrl(row.configFile),
  }
}

export async function onTrainingComplete(input: {
  runId?: string
  falRequestId?: string
  data?: unknown
  error?: string
}): Promise<void> {
  const run = input.runId
    ? await db.trainingRun.findUnique({ where: { id: input.runId } })
    : input.falRequestId
      ? await db.trainingRun.findFirst({ where: { falRequestId: input.falRequestId } })
      : null
  if (!run) return
  if (run.status === 'complete') {
    if (!run.trainedAssetId) await promoteTrainingRunToAsset(run.id).catch((err) => logCaught('lib/training/complete', err))
    return
  }

  if (input.error) {
    await failTrainingRun(run.id, input.error)
    return
  }

  const urls = loraUrlsFromResult(input.data)
  if (!urls.loraUrl) {
    await failTrainingRun(run.id, 'Training finished without a LoRA file URL')
    return
  }

  await db.trainingRun.update({
    where: { id: run.id },
    data: {
      status: 'complete',
      loraUrl: urls.loraUrl,
      configUrl: urls.configUrl ?? null,
      progressPct: 100,
      completedAt: new Date(),
      errorMessage: null,
    },
  })
  if (run.jobId) {
    await db.renderJob.update({
      where: { id: run.jobId },
      data: {
        status: 'COMPLETE',
        progressPct: 100,
        statusMessage: 'LoRA training complete',
        outputUrl: urls.loraUrl,
        completedAt: new Date(),
      },
    }).catch((err) => logCaught('lib/training/complete', err))
    await broadcastJobEvent({
      jobId: run.jobId,
      status: 'complete',
      progress: 100,
      message: 'LoRA training complete',
      outputUrl: urls.loraUrl,
    })
  }
  await promoteTrainingRunToAsset(run.id).catch((err) => logCaught('lib/training/complete', err))
}

export async function failTrainingRun(runId: string, message: string, err?: unknown): Promise<void> {
  const current = await db.trainingRun.findUnique({ where: { id: runId } })
  if (!current || current.status === 'complete') return
  const run = await db.trainingRun.update({
    where: { id: runId },
    data: {
      status: 'failed',
      errorMessage: message,
      completedAt: new Date(),
    },
  })
  await captureGenerationError({
    err,
    rawError: message,
    userId: run.userId,
    jobId: run.jobId ?? undefined,
    model: run.trainerKey,
    endpoint: run.trainerId,
    stage: 'poll',
    falRequestId: run.falRequestId ?? undefined,
  })
  if (run.jobId) {
    const job = await db.renderJob.findUnique({
      where: { id: run.jobId },
      select: { creditsCharged: true },
    }).catch((err) => {
      console.warn("[caught] src/lib/training/complete.ts:122", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (null)
    })
    if (job?.creditsCharged && job.creditsCharged > 0) {
      const { refundCredits } = await import('@/lib/credits')
      await refundCredits(run.userId, job.creditsCharged, `Refund for failed training ${run.jobId}`).catch((err) => logCaught('lib/training/complete', err))
    }
    await db.renderJob.update({
      where: { id: run.jobId },
      data: {
        status: 'FAILED',
        creditsCharged: 0,
        errorMessage: message,
        statusMessage: message,
        completedAt: new Date(),
      },
    }).catch((err) => logCaught('lib/training/complete', err))
    await broadcastJobEvent({ jobId: run.jobId, status: 'failed', error: message })
  }
}
