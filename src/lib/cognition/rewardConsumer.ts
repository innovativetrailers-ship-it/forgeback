import { logCaught } from '@/lib/diagnostics/caught'
import { db } from '@/lib/db'
import { updateRoutingPolicy } from './memory/procedural'
import { updatePerformance } from './learnOutcomes'
import { isShotPurpose, purposeForContent, purposeForRatingReason, type ShotPurpose } from '@cinema/core'

interface JobSegment {
  model: string
  contentType?: string
  purpose?: string
  mode?: string
}

function extractSegments(metadata: unknown): JobSegment[] {
  if (!metadata || typeof metadata !== 'object') return []
  const segs = (metadata as { segments?: unknown }).segments
  if (!Array.isArray(segs)) return []
  return segs.filter((s): s is JobSegment => !!s && typeof s === 'object' && typeof (s as JobSegment).model === 'string')
}

function purposeOf(seg: JobSegment, fallback?: string | null): ShotPurpose {
  if (seg.purpose && isShotPurpose(seg.purpose)) return seg.purpose
  if (fallback && isShotPurpose(fallback)) return fallback
  return purposeForContent(seg.contentType ?? '', false)
}

/** Batch consumer for RewardSignal. Writes Layer 3 (model × purpose) and the legacy content-type policy. */
export async function consumeRewardSignals(limit = 200): Promise<number> {
  const rows = await db.rewardSignal.findMany({
    where: { appliedAt: null },
    orderBy: { createdAt: 'asc' },
    take: limit,
  })

  for (const row of rows) {
    const job = row.jobId
      ? await db.renderJob.findUnique({ where: { id: row.jobId } }).catch((err) => {
        console.warn("[caught] src/lib/cognition/rewardConsumer.ts:37", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (null)
      })
      : null
    const clip = row.shotId
      ? await db.studioClip.findUnique({
        where: { id: row.shotId },
        select: { assignedModel: true, purpose: true, delegatedMode: true },
      }).catch((err) => {
        console.warn("[caught] src/lib/cognition/rewardConsumer.ts:43", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (null)
      })
      : null
    const fromJob = extractSegments(job?.metadata)
    const targets = fromJob.length
      ? fromJob
      : (row.model || clip?.assignedModel)
        ? [{
            model: row.model ?? clip?.assignedModel ?? '',
            contentType: row.contentType ?? undefined,
            purpose: row.purpose ?? clip?.purpose ?? undefined,
            mode: row.mode ?? clip?.delegatedMode ?? undefined,
          }]
        : []

    for (const seg of targets) {
      if (!seg.model) continue
      const adjusted = Math.max(0, Math.min(1, 0.5 + row.reward * 0.2))
      await updateRoutingPolicy(seg.contentType ?? 'unknown', seg.model, adjusted, 60).catch((err) => logCaught('lib/cognition/rewardConsumer', err))
      const purpose = purposeForRatingReason(row.reason ?? undefined, purposeOf(seg, row.purpose))
      await updatePerformance({
        shotId: row.shotId ?? undefined,
        model: seg.model,
        mode: seg.mode ?? row.mode ?? undefined,
        purpose,
        signal: row.reward,
        source: row.source === 'rating' ? 'rating' : 'behaviour',
        reason: row.reason ?? undefined,
      }, row.userId).catch((err) => logCaught('lib/cognition/rewardConsumer', err))
    }

    await db.rewardSignal.update({
      where: { id: row.id },
      data: { appliedAt: new Date() },
    })
  }

  return rows.length
}
