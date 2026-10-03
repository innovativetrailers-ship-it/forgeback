import { logCaught } from '@/lib/diagnostics/caught'
import {
  CLAIM_STALE_MS,
  decideShotClaim,
  type ClaimDecision,
  type ClaimState,
} from '@cinema/core'
import { db } from '@/lib/db'
import { deductUserCredits } from '@/lib/access/guard'
import { broadcastCollab } from '@/lib/collab/hub'

function toClaimState(clip: {
  id: string
  status: string
  videoUrl: string | null
  falRequestId: string | null
  generateClaimJobId: string | null
  generateClaimedBy: string | null
  generateClaimedAt: Date | null
  generatingAt: Date | null
}): ClaimState {
  return {
    clipId: clip.id,
    status: clip.status,
    videoUrl: clip.videoUrl,
    falRequestId: clip.falRequestId,
    generateClaimJobId: clip.generateClaimJobId,
    generateClaimedBy: clip.generateClaimedBy,
    generateClaimedAt: clip.generateClaimedAt?.getTime() ?? null,
    generatingAt: clip.generatingAt?.getTime() ?? null,
  }
}

export type ShotClaimResult =
  | { outcome: 'completed'; videoUrl: string; jobId: string | null }
  | { outcome: 'attached'; jobId: string }
  | { outcome: 'claimed'; jobId: string }
  | { outcome: 'refused'; reason: string }

export async function claimOrAttachShot(input: {
  clipId: string
  projectId: string
  actorUserId: string
  ownerUserId: string
  creditCost: number
  prompt: string
  duration: number
  metadata: Record<string, unknown>
}): Promise<ShotClaimResult> {
  const clip = await db.studioClip.findUnique({ where: { id: input.clipId } })
  if (!clip) return { outcome: 'refused', reason: 'Shot not found' }

  const decision: ClaimDecision = decideShotClaim(toClaimState(clip), Date.now(), CLAIM_STALE_MS)
  if (decision.kind === 'skip-completed') {
    return { outcome: 'completed', videoUrl: decision.videoUrl, jobId: clip.generateClaimJobId }
  }
  if (decision.kind === 'attach') {
    broadcastCollab(input.projectId, {
      type: 'generation',
      clipId: input.clipId,
      jobId: decision.jobId,
      status: 'attached',
      attached: true,
    })
    return { outcome: 'attached', jobId: decision.jobId }
  }
  if (decision.kind === 'refuse-inflight') {
    return { outcome: 'refused', reason: decision.reason }
  }

  const job = await db.renderJob.create({
    data: {
      userId: input.ownerUserId,
      projectId: input.projectId,
      type: 'GENERATE',
      status: 'QUEUED',
      mode: 'director',
      prompt: input.prompt,
      duration: input.duration,
      creditsCharged: input.creditCost,
      metadata: {
        ...input.metadata,
        triggeredBy: input.actorUserId,
        billedUserId: input.ownerUserId,
      },
    },
  })

  const stale = new Date(Date.now() - CLAIM_STALE_MS)
  const claimed = await db.studioClip.updateMany({
    where: {
      id: input.clipId,
      generateClaimJobId: null,
      OR: [
        { generatingAt: null },
        { generatingAt: { lt: stale } },
      ],
      NOT: {
        AND: [
          { status: 'COMPLETED' },
          { videoUrl: { not: null } },
        ],
      },
    },
    data: {
      generateClaimJobId: job.id,
      generateClaimedBy: input.actorUserId,
      generateClaimedAt: new Date(),
      generatingAt: new Date(),
      status: 'GENERATING',
    },
  })

  if (claimed.count !== 1) {
    await db.renderJob.update({
      where: { id: job.id },
      data: { status: 'CANCELLED', errorMessage: 'Attached to in-flight generation' },
    }).catch((err) => logCaught('lib/collab/claimShot', err))
    const again = await db.studioClip.findUnique({ where: { id: input.clipId } })
    if (again?.status === 'COMPLETED' && again.videoUrl?.trim()) {
      return { outcome: 'completed', videoUrl: again.videoUrl, jobId: again.generateClaimJobId }
    }
    if (again?.generateClaimJobId) {
      broadcastCollab(input.projectId, {
        type: 'generation',
        clipId: input.clipId,
        jobId: again.generateClaimJobId,
        status: 'attached',
        attached: true,
      })
      return { outcome: 'attached', jobId: again.generateClaimJobId }
    }
    return { outcome: 'refused', reason: 'Could not claim shot' }
  }

  if (input.creditCost > 0) {
    try {
      await deductUserCredits(input.ownerUserId, input.creditCost, `Shot generate ${input.clipId}`)
    } catch (err) {
      await db.studioClip.update({
        where: { id: input.clipId },
        data: {
          generateClaimJobId: null,
          generateClaimedBy: null,
          generateClaimedAt: null,
          generatingAt: null,
          status: 'AWAITING_DIRECTION',
        },
      }).catch((err) => logCaught('lib/collab/claimShot', err))
      await db.renderJob.update({
        where: { id: job.id },
        data: { status: 'FAILED', errorMessage: err instanceof Error ? err.message : 'Credit deduct failed' },
      }).catch((err) => logCaught('lib/collab/claimShot', err))
      throw err
    }
  }

  broadcastCollab(input.projectId, {
    type: 'generation',
    clipId: input.clipId,
    jobId: job.id,
    status: 'claimed',
  })
  return { outcome: 'claimed', jobId: job.id }
}
