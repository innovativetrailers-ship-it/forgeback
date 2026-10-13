import {
  applyOutcome,
  isShotPurpose,
  purposeForContent,
  purposeForRatingReason,
  signalForKind,
  type LearnedByPurpose,
  type ShotOutcome,
  type ShotPurpose,
} from '@cinema/core'
import { db } from '@/lib/db'

function asPurpose(value: string | null | undefined, fallback: ShotPurpose = 'hero'): ShotPurpose {
  if (value && isShotPurpose(value)) return value
  return fallback
}

export async function learnedOverlayFor(userId: string): Promise<Record<string, Partial<LearnedByPurpose>>> {
  const rows = await db.modelPurposeScore.findMany({ where: { userId } })
  const overlay: Record<string, Partial<LearnedByPurpose>> = {}
  for (const row of rows) {
    if (!isShotPurpose(row.purpose)) continue
    const byModel = overlay[row.model] ?? {}
    byModel[row.purpose] = { worked: row.worked, total: row.total, score: row.score }
    overlay[row.model] = byModel
  }
  return overlay
}

export async function updatePerformance(outcome: ShotOutcome, userId: string): Promise<void> {
  const purpose = purposeForRatingReason(outcome.reason, outcome.purpose)
  const existing = await db.modelPurposeScore.findUnique({
    where: { userId_model_purpose: { userId, model: outcome.model, purpose } },
  })
  const prior = existing
    ? { worked: existing.worked, total: existing.total, score: existing.score }
    : { worked: 0, total: 0, score: 0.5 }
  const next = applyOutcome(prior, outcome.signal, outcome.source)
  console.log('[learned_overlay]', {
    model: outcome.model,
    purpose,
    before: prior.score,
    after: next.score,
    total: next.total,
  })
  await db.modelPurposeScore.upsert({
    where: { userId_model_purpose: { userId, model: outcome.model, purpose } },
    create: {
      userId,
      model: outcome.model,
      purpose,
      mode: outcome.mode,
      worked: next.worked,
      total: next.total,
      score: next.score,
    },
    update: {
      mode: outcome.mode ?? existing?.mode,
      worked: next.worked,
      total: next.total,
      score: next.score,
    },
  })
}

export async function recordShotOutcome(input: {
  userId: string
  shotId?: string | null
  jobId?: string | null
  signal: string
  source?: 'behaviour' | 'rating'
  reason?: string
  reward?: number
  model?: string | null
  purpose?: string | null
  mode?: string | null
  contentType?: string | null
}): Promise<void> {
  const reward = input.reward ?? signalForKind(input.signal, input.source ?? 'behaviour')
  let model = input.model ?? null
  let purpose = input.purpose ?? null
  let mode = input.mode ?? null
  let contentType = input.contentType ?? null

  if (input.shotId) {
    const clip = await db.studioClip.findUnique({
      where: { id: input.shotId },
      select: { assignedModel: true, purpose: true, delegatedMode: true },
    }).catch((err) => {
      console.warn("[caught] src/lib/cognition/learnOutcomes.ts:82", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (null)
    })
    if (clip) {
      model = model ?? clip.assignedModel
      purpose = purpose ?? clip.purpose
      mode = mode ?? clip.delegatedMode
    }
  }

  const resolvedPurpose = purposeForRatingReason(
    input.reason,
    asPurpose(purpose, purposeForContent(contentType ?? '', false)),
  )

  const row = await db.rewardSignal.create({
    data: {
      userId: input.userId,
      jobId: input.jobId ?? null,
      shotId: input.shotId ?? null,
      model,
      contentType,
      purpose: resolvedPurpose,
      mode,
      reason: input.reason ?? null,
      source: input.source ?? 'behaviour',
      signal: input.signal,
      reward,
    },
  })

  if (model) {
    await updatePerformance({
      shotId: input.shotId ?? undefined,
      model,
      mode: mode ?? undefined,
      purpose: resolvedPurpose,
      signal: reward,
      source: input.source ?? 'behaviour',
      reason: input.reason,
    }, input.userId)
    await db.rewardSignal.update({
      where: { id: row.id },
      data: { appliedAt: new Date() },
    })
  }
}
