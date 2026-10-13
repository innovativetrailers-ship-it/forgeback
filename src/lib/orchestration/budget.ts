/**
 * Layer 4 — per-run budget caps and pause-on-failure policy.
 */

import { db } from '@/lib/db'
import { MissingPriceError } from '@/lib/credits'
import { getHold } from '@/lib/credits/escrow'

export const TIER_BUDGET_CAPS: Record<string, number> = {
  free:     80,
  pro:      400,
  studio:   1_500,
  ultimate: 5_000,
  admin:    999_999,
}

export class BudgetCapReached extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'BudgetCapReached'
  }
}

export class NeedsAttentionError extends Error {
  readonly shotIndex: number
  readonly reason: string

  constructor(shotIndex: number, reason: string) {
    super(`Shot ${shotIndex + 1}: ${reason}`)
    this.name = 'NeedsAttentionError'
    this.shotIndex = shotIndex
    this.reason = reason
  }
}

export async function assertBudgetForSegment(
  jobId: string,
  segmentCost: number,
): Promise<void> {
  if (!Number.isFinite(segmentCost) || segmentCost <= 0) {
    throw new MissingPriceError('Cost estimate was not a finite credit number')
  }
  const hold = await getHold(jobId)
  if (!hold?.budgetCap) return
  if (hold.amountUsed + segmentCost > hold.budgetCap) {
    await pauseJob(jobId, 'BUDGET_CAP_REACHED', `Budget cap of ${hold.budgetCap} credits reached`)
    throw new BudgetCapReached(`Run budget cap (${hold.budgetCap} credits) would be exceeded`)
  }
}

export async function pauseJob(
  jobId: string,
  pauseReason: string,
  statusMessage: string,
): Promise<void> {
  const row = await db.renderJob.findUnique({ where: { id: jobId }, select: { metadata: true } })
  const prevMeta = (row?.metadata as Record<string, unknown>) ?? {}
  await db.renderJob.update({
    where: { id: jobId },
    data: {
      status: 'NEEDS_ATTENTION',
      statusMessage,
      phase: 'paused_needs_attention',
      metadata: { ...prevMeta, pauseReason },
    },
  })
}

export async function onPermanentSegmentFailure(
  jobId: string,
  shotIndex: number,
  reason: string,
): Promise<void> {
  await pauseJob(
    jobId,
    `shot_${shotIndex}`,
    `Shot ${shotIndex + 1} failed after retries: ${reason}. Completed shots are saved.`,
  )
  throw new NeedsAttentionError(shotIndex, reason)
}
