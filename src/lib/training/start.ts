import {
  buildTrainerInput,
  costsMatch,
  trainerDef,
  trainingCostUsd,
} from '@cinema/core'
import { db } from '@/lib/db'
import { submitToFal, serializeFalSubmission } from '@/lib/fal/falQueue'
import { withGenContext } from '@/lib/diagnostics/correlation'
import { isGenerationPaused } from '@/lib/generation/pause'
import { checkAccess } from '@/lib/access/guard'

export function confirmTrainingCost(trainerKey: string, steps: number, confirmedCostUsd: number): number {
  const trainer = trainerDef(trainerKey)
  if (!trainer) throw new Error(`Unknown trainer ${trainerKey}`)
  const cost = trainingCostUsd(trainer, steps)
  if (!costsMatch(cost, confirmedCostUsd)) {
    throw new Error(`Cost mismatch: expected $${cost}, confirmed $${confirmedCostUsd}`)
  }
  return cost
}

export async function startTraining(input: {
  runId: string
  userId: string
  jobId?: string
  trainerKey: string
  dataUrl: string
  triggerPhrase?: string
  steps: number
  confirmedCostUsd: number
}): Promise<{ requestId: string; costUsd: number }> {
  if (isGenerationPaused()) {
    throw new Error('Generation is paused (GENERATION_PAUSED). Training is a paid FAL call.')
  }
  const trainer = trainerDef(input.trainerKey)
  if (!trainer) throw new Error(`Unknown trainer ${input.trainerKey}`)
  const costUsd = confirmTrainingCost(input.trainerKey, input.steps, input.confirmedCostUsd)
  const access = await checkAccess(input.userId, Math.max(1, Math.ceil(costUsd)))
  if (!access.allowed) throw new Error(access.reason)
  const payload = buildTrainerInput(trainer, input.dataUrl, {
    triggerPhrase: input.triggerPhrase,
    steps: input.steps,
  })
  const webhookUrl = process.env.NEXT_PUBLIC_APP_URL
    ? `${process.env.NEXT_PUBLIC_APP_URL.replace(/\/$/, '')}/api/webhooks/fal`
    : undefined

  return withGenContext({
    userId: input.userId,
    jobId: input.jobId,
    model: trainer.base,
    purpose: trainer.trains,
    endpoint: trainer.id,
    source: `training.${trainer.trains}`,
    stage: 'submit',
  }, async () => {
    const submission = await submitToFal(
      trainer.id,
      payload,
      `training.${trainer.trains}`,
      input.jobId,
      { webhookUrl },
    )
    await db.trainingRun.update({
      where: { id: input.runId },
      data: {
        status: 'training',
        costUsd,
        dataUrl: input.dataUrl,
        falRequestId: submission.requestId,
        falSubmission: serializeFalSubmission(submission),
        progressPct: 10,
      },
    })
    return { requestId: submission.requestId, costUsd }
  })
}
