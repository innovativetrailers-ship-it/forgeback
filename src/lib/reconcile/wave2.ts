import { db } from '@/lib/db'
import { Prisma } from '@/generated/prisma/client'
import { isGenerationPaused } from '@/lib/generation/pause'
import { rollupScene } from '@/lib/studio/sceneRollup'
import { canonicalAssetState, clipReason, MISSING_FAIL_REASON } from '@/lib/reconcile/wave2Reasons'
import { ledgerBalance } from '@/lib/credits/meter'
import { reportedLedgerBalance } from '@/lib/credits/ledgerDrift'

const TRAINING_TIMEOUT_MS = 6 * 60 * 60 * 1000

export interface ReconcileReport {
  clipsRetagged: number
  clipsRetryEligible: number
  jobsClosed: number
  ledgerCorrected: number
  countersCorrected: number
  charactersClosed: number
  platesCopied: number
  assetsFlagged: number
  draftsPatched: number
}

export async function reconcileClipBacklog(): Promise<Pick<ReconcileReport, 'clipsRetagged' | 'clipsRetryEligible' | 'jobsClosed'>> {
  const pending = await db.studioClip.findMany({
    where: { status: 'PENDING' },
    select: { id: true, sceneId: true, keyframeUrl: true, prompt: true, videoUrl: true },
  })
  let clipsRetagged = 0
  let clipsRetryEligible = 0
  const scenes = new Set<string>()
  for (const clip of pending) {
    if (clip.videoUrl) {
      await db.studioClip.update({
        where: { id: clip.id },
        data: { status: 'COMPLETED', statusReason: null, retryEligible: false },
      })
      scenes.add(clip.sceneId)
      clipsRetagged += 1
      continue
    }
    const next = clipReason(clip, isGenerationPaused())
    await db.studioClip.update({
      where: { id: clip.id },
      data: { status: 'FAILED', statusReason: next.failed, retryEligible: next.retry },
    })
    if (next.retry) clipsRetryEligible += 1
    scenes.add(clip.sceneId)
    clipsRetagged += 1
  }
  for (const sceneId of scenes) await rollupScene(sceneId)

  const stuck = await db.renderJob.updateMany({
    where: {
      status: 'PROCESSING',
      outputUrl: null,
      updatedAt: { lt: new Date(Date.now() - 60 * 60 * 1000) },
    },
    data: {
      status: 'FAILED',
      errorMessage: 'Reconciled: processing for over an hour with no output. Not resubmitted while generation is paused.',
      completedAt: new Date(),
    },
  })

  return { clipsRetagged, clipsRetryEligible, jobsClosed: stuck.count }
}

/** A purchase that is in the balance but not yet in an older ledger sum must not be wiped. */

/** Internal accounts stay at balance 0 and are not rewritten from the historical ledger. */
export async function reconcileLedgers(): Promise<number> {
  await db.creditTransaction.updateMany({ where: { type: null, amount: { gt: 0, lt: 100000 } }, data: { type: 'signup_grant' } })
  await db.creditTransaction.updateMany({ where: { type: null, amount: { gte: 100000 } }, data: { type: 'adjustment' } })
  await db.creditTransaction.updateMany({ where: { type: null, amount: { lt: 0 } }, data: { type: 'deduction' } })

  const users = await db.user.findMany({
    where: { isInternal: false },
    select: { id: true, creditBalance: true, heldCredits: true },
  })
  let corrected = 0
  for (const user of users) {
    const txns = await db.creditTransaction.findMany({ where: { userId: user.id }, select: { amount: true } })
    const held = await db.creditHold.aggregate({
      where: { userId: user.id, status: 'ACTIVE' },
      _sum: { amountHeld: true },
    })
    // Every ledger row is already a grant, deduction, hold, or release.
    // Subtracting active holds again would charge the hold twice.
    const ledger = ledgerBalance(txns)
    const activeHeld = held._sum.amountHeld ?? 0
    const kept = reportedLedgerBalance(user.creditBalance, ledger)
    if (kept !== ledger || user.heldCredits !== activeHeld) {
      console.warn('[ledger] drift', user.id, 'balance', user.creditBalance, 'ledger', ledger, 'held', user.heldCredits, 'activeHeld', activeHeld)
      corrected += 1
    }
  }
  return corrected
}

export async function reconcileCounters(): Promise<number> {
  const users = await db.user.findMany({ select: { id: true, totalGenerated: true, isInternal: true } })
  let corrected = 0
  for (const user of users) {
    const completed = await db.studioClip.count({
      where: { status: 'COMPLETED', scene: { project: { userId: user.id } } },
    })
    if (user.totalGenerated !== completed) {
      await db.user.update({ where: { id: user.id }, data: { totalGenerated: completed } })
      corrected += 1
    }
  }
  return corrected
}

export async function reconcileTraining(): Promise<number> {
  const failedJob = await db.renderJob.findFirst({
    where: { type: 'LORA_TRAIN', status: 'FAILED' },
    orderBy: { updatedAt: 'desc' },
    select: { errorMessage: true },
  })
  const reason = failedJob?.errorMessage?.trim() || 'Training did not produce a LoRA. The character was kept.'
  const cutoff = new Date(Date.now() - TRAINING_TIMEOUT_MS)
  const stuck = await db.vaultCharacter.findMany({
    where: {
      loraStatus: 'TRAINING',
      OR: [{ loraModelId: null }, { updatedAt: { lt: cutoff } }],
    },
    select: { id: true },
  })
  if (stuck.length) {
    await db.vaultCharacter.updateMany({
      where: { id: { in: stuck.map((row) => row.id) } },
      data: { loraStatus: 'FAILED', loraError: reason },
    })
  }
  const unexplained = await db.vaultCharacter.updateMany({
    where: { loraStatus: 'FAILED', loraError: null },
    data: { loraError: reason },
  })
  return stuck.length + unexplained.count
}

export async function reconcileLocations(): Promise<number> {
  const plates = await db.locationPlate.findMany()
  let copied = 0
  for (const plate of plates) {
    let assetId = plate.assetId
    if (!assetId) {
      const asset = await db.asset.create({
        data: {
          ownerId: plate.userId,
          kind: 'location',
          label: plate.displayName || plate.city || 'Location',
          generatedImage: plate.imageUrl,
          sourceRefs: [plate.id, plate.sourceUrl].filter(Boolean),
          resolutionState: 'imported',
          usableAsReference: true,
          boundary: {
            plateId: plate.id,
            type: plate.type,
            lat: plate.lat,
            lng: plate.lng,
            city: plate.city,
            country: plate.country,
            sourceUrl: plate.sourceUrl,
          },
        },
        select: { id: true },
      })
      assetId = asset.id
      await db.locationPlate.update({ where: { id: plate.id }, data: { assetId } })
      copied += 1
    }
  }
  return copied
}

export async function flagUnresolvedAssets(): Promise<number> {
  const rows = await db.asset.findMany({
    where: { resolutionState: { in: ['unresolved', 'needs_action', 'resolved'] } },
    select: { id: true, kind: true, generatedImage: true, weightsKey: true, resolutionState: true },
  })
  let flagged = 0
  for (const row of rows) {
    const next = canonicalAssetState(row)
    const current = await db.asset.findUnique({ where: { id: row.id }, select: { boundary: true, resolutionState: true } })
    const boundary = (current?.boundary && typeof current.boundary === 'object' && !Array.isArray(current.boundary))
      ? { ...(current.boundary as Record<string, unknown>) }
      : {}
    if (next.needsAction) boundary.needsAction = 'Unresolved — action needed. Nothing was generated.'
    const already = current?.resolutionState === next.resolutionState && (!next.needsAction || Boolean(boundary.needsAction))
    if (already) continue
    await db.asset.update({
      where: { id: row.id },
      data: { resolutionState: next.resolutionState, boundary: boundary as Prisma.InputJsonValue },
    })
    flagged += 1
  }
  return flagged
}

export async function patchDraftPlaceholders(): Promise<number> {
  const projects = await db.project.findMany({
    where: { status: 'draft' },
    select: { id: true, timelineJson: true },
  })
  let patched = 0
  for (const project of projects) {
    const recipe = project.timelineJson as { tracks?: Array<{ clips?: Array<Record<string, unknown>> }> } | null
    if (!recipe?.tracks) continue
    let changed = false
    for (const track of recipe.tracks) {
      for (const clip of track.clips ?? []) {
        const source = typeof clip.sourceUrl === 'string' ? clip.sourceUrl.trim() : ''
        const prompt = typeof clip.prompt === 'string' ? clip.prompt.trim() : ''
        if (!source && !prompt) {
          clip.prompt = 'Missing media. This clip was kept.'
          clip.statusReason = 'orphan-placeholder'
          changed = true
        }
      }
    }
    if (!changed) continue
    await db.project.update({ where: { id: project.id }, data: { timelineJson: recipe as Prisma.InputJsonValue } })
    patched += 1
  }
  return patched
}

export async function fillMissingFailReasons(): Promise<number> {
  const rows = await db.studioClip.findMany({
    where: { status: 'FAILED', OR: [{ statusReason: null }, { statusReason: '' }] },
    select: { id: true, generateClaimJobId: true },
  })
  let filled = 0
  for (const row of rows) {
    let reason = MISSING_FAIL_REASON
    if (row.generateClaimJobId) {
      const job = await db.renderJob.findUnique({ where: { id: row.generateClaimJobId }, select: { errorMessage: true } })
      if (job?.errorMessage?.trim()) reason = job.errorMessage.trim()
    }
    await db.studioClip.update({ where: { id: row.id }, data: { statusReason: reason } })
    filled += 1
  }
  return filled
}

/** Tags the pre-fix cancelled pile. Does not change status and does not re-queue. */
export async function markCancelledResidue(): Promise<number> {
  const rows = await db.renderJob.findMany({
    where: { status: 'CANCELLED' },
    select: { id: true, metadata: true },
  })
  let tagged = 0
  for (const row of rows) {
    const meta = row.metadata && typeof row.metadata === 'object' && !Array.isArray(row.metadata)
      ? row.metadata as Record<string, unknown>
      : {}
    if (meta.historicalResidue === true) continue
    await db.renderJob.update({
      where: { id: row.id },
      data: { metadata: { ...meta, historicalResidue: true } as Prisma.InputJsonValue },
    })
    tagged += 1
  }
  return tagged
}

export async function runWave2Reconcile(): Promise<ReconcileReport> {
  const clips = await reconcileClipBacklog()
  const ledgerCorrected = await reconcileLedgers()
  const countersCorrected = await reconcileCounters()
  const charactersClosed = await reconcileTraining()
  const platesCopied = await reconcileLocations()
  const assetsFlagged = await flagUnresolvedAssets()
  await fillMissingFailReasons()
  await markCancelledResidue()
  const draftsPatched = await patchDraftPlaceholders()
  return { ...clips, ledgerCorrected, countersCorrected, charactersClosed, platesCopied, assetsFlagged, draftsPatched }
}
