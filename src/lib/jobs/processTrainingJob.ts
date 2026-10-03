import { db } from '@/lib/db'
import { broadcastJobEvent } from '@/lib/queue/events'
import { refundCredits } from '@/lib/credits'
import { parseFalSubmission, pollFalResult } from '@/lib/fal/falQueue'
import { onTrainingComplete, failTrainingRun } from '@/lib/training/complete'

export type TrainingJobPayload =
  | {
      kind: 'lora'
      jobId: string
      userId: string
      runId: string
    }
  | {
      kind?: 'character-legacy'
      jobId: string
      userId: string
      characterId: string
      imageUrls: string[]
      triggerWord: string
    }

const POLL_INTERVAL_MS = 15_000
const TRAINING_TIMEOUT_MS = 2 * 60 * 60 * 1000

function isLoraPayload(payload: TrainingJobPayload): payload is Extract<TrainingJobPayload, { kind: 'lora' }> {
  return payload.kind === 'lora'
}

async function updateProgress(jobId: string, progress: number, message: string) {
  await db.renderJob.update({
    where: { id: jobId },
    data: { status: 'PROCESSING', progressPct: progress, statusMessage: message },
  })
  await broadcastJobEvent({ jobId, status: 'processing', progress, message })
}

async function processLoraRun(payload: Extract<TrainingJobPayload, { kind: 'lora' }>): Promise<void> {
  const run = await db.trainingRun.findUnique({ where: { id: payload.runId } })
  if (!run) throw new Error(`TrainingRun ${payload.runId} not found`)
  if (run.status === 'complete') return
  const submission = run.falSubmission ? parseFalSubmission(run.falSubmission) : null
  if (!submission) {
    await failTrainingRun(run.id, 'No FAL submission to poll')
    return
  }
  await updateProgress(payload.jobId, 15, 'Training queued…')
  const result = await pollFalResult(submission, {
    jobId: payload.jobId,
    timeoutMs: TRAINING_TIMEOUT_MS,
    pollIntervalMs: POLL_INTERVAL_MS,
    onProgress: (pct) => {
      const scaled = pct <= 1 ? pct * 100 : pct
      const progress = Math.min(90, Math.max(15, Math.round(scaled)))
      void db.trainingRun.update({
        where: { id: run.id },
        data: { progressPct: progress, status: 'training' },
      })
      void updateProgress(payload.jobId, progress, 'Training in progress…')
    },
  })
  await onTrainingComplete({ runId: run.id, falRequestId: submission.requestId, data: result.data })
}

export async function processTrainingJob(payload: TrainingJobPayload): Promise<void> {
  if (isLoraPayload(payload)) {
    const { runId } = payload
    try {
      await processLoraRun(payload)
    } catch (err) {
      const current = await db.trainingRun.findUnique({ where: { id: runId } })
      if (current?.status === 'complete') return
      const message = err instanceof Error ? err.message : 'Training failed'
      await failTrainingRun(runId, message, err)
      throw err
    }
    return
  }

  const { jobId, userId } = payload

  await updateProgress(jobId, 5, 'Starting LoRA training…')

  try {
    throw new Error('Flux-fast vault training is retired. Character LoRA uses a TrainingRun.')
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Training failed'

    const renderJob = await db.renderJob.findUnique({
      where: { id: jobId },
      select: { creditsCharged: true },
    })

    if (renderJob?.creditsCharged) {
      await refundCredits(userId, renderJob.creditsCharged, `Refund for failed training ${jobId}`)
    }

    await db.renderJob.update({
      where: { id: jobId },
      data: {
        status: 'FAILED',
        errorMessage: message,
        statusMessage: message,
        completedAt: new Date(),
      },
    })

    await broadcastJobEvent({ jobId, status: 'failed', error: message })
    throw err
  }
}

export async function processTrainingJobWithRefund(payload: TrainingJobPayload): Promise<void> {
  try {
    await processTrainingJob(payload)
  } catch (err) {
    console.error('[processTrainingJob]', err instanceof Error ? err.message : err)
  }
}
