import { db } from '@/lib/db'
import { persistClipVideoToR2 } from '@/lib/storage/persistMedia'
import { clipVideoKey, objectKeyFromStored } from '@/lib/storage/r2'
import { advanceChain, getOrderedClips } from './advanceChain'
import { noteClipTerminal } from '@/lib/studio/sceneRollup'

const clipIdCache = new Map<string, Map<number, string>>()

async function clipIdForShotIndex(projectId: string, shotIndex: number): Promise<string | null> {
  let byIndex = clipIdCache.get(projectId)
  if (!byIndex || !byIndex.has(shotIndex)) {
    const ordered = await getOrderedClips(db, projectId)
    byIndex = new Map(ordered.map((c) => [c.shotNumber - 1, c.id]))
    clipIdCache.set(projectId, byIndex)
  }
  return byIndex.get(shotIndex) ?? null
}

export function invalidateBatchClipCache(projectId: string): void {
  clipIdCache.delete(projectId)
}

export async function markBatchClipGenerating(projectId: string, shotIndex: number): Promise<void> {
  const clipId = await clipIdForShotIndex(projectId, shotIndex)
  if (!clipId) return
  await db.studioClip.updateMany({
    where: {
      id: clipId,
      status: { in: ['PENDING', 'AWAITING_DIRECTION', 'FAILED'] },
    },
    data: { status: 'GENERATING', generatingAt: new Date() },
  })
}

export async function markBatchClipCompleted(
  projectId: string,
  shotIndex: number,
  videoUrl: string,
  lastFrame?: string,
): Promise<string | null> {
  const clipId = await clipIdForShotIndex(projectId, shotIndex)
  if (!clipId || !videoUrl.trim()) {
    console.warn('[director] clip completion skipped', { projectId, shotIndex, hasUrl: Boolean(videoUrl.trim()) })
    return null
  }

  await persistCompletedClip(clipId, projectId, videoUrl, lastFrame)
  return `/api/media/${clipId}`
}

/** Write completed + the provider URL first. A later mirror or chain error cannot flip the shot to failed. */
export async function persistCompletedClip(
  clipId: string,
  projectId: string,
  videoUrl: string,
  lastFrame?: string | null,
  rawUrl?: string | null,
): Promise<void> {
  const providerUrl = videoUrl.trim()
  if (!providerUrl) return
  const raw = rawUrl?.trim() || providerUrl
  const before = await db.studioClip.findUnique({ where: { id: clipId }, select: { status: true } })

  await db.studioClip.update({
    where: { id: clipId },
    data: {
      status: 'COMPLETED',
      videoUrl: providerUrl,
      rawVideoUrl: raw !== providerUrl ? raw : null,
      lastFrame: lastFrame ?? null,
      generatingAt: null,
      generateClaimJobId: null,
      generateClaimedBy: null,
      generateClaimedAt: null,
      manualVideo: false,
      storageKey: objectKeyFromStored(providerUrl),
    },
  })
  await noteClipTerminal(clipId, before?.status !== 'COMPLETED')

  try {
    const stored = await persistClipVideoToR2(providerUrl, projectId, clipId)
    const storageKey = objectKeyFromStored(stored) ?? clipVideoKey(projectId, clipId)
    if (stored !== providerUrl || storageKey) {
      await db.studioClip.update({
        where: { id: clipId },
        data: { videoUrl: stored, rawVideoUrl: raw, storageKey },
      })
    }
  } catch (err) {
    console.warn('[director] clip mirror failed; shot stays completed with provider url', {
      projectId,
      clipId,
      error: err instanceof Error ? err.message : String(err),
    })
  }

  await landCompletedClip(projectId, clipId).catch((err) => {
    console.warn('[library] shot landing failed', err instanceof Error ? err.message : err)
  })

  await advanceChain(db, projectId, clipId, lastFrame ?? null).catch((err) => {
    console.warn('[director] chain advance skipped', {
      clipId,
      error: err instanceof Error ? err.message : String(err),
    })
  })
}

async function landCompletedClip(projectId: string, clipId: string): Promise<void> {
  const clip = await db.studioClip.findUnique({
    where: { id: clipId },
    select: {
      storageKey: true,
      videoUrl: true,
      rawVideoUrl: true,
      prompt: true,
      boundary: true,
      sceneId: true,
      scene: { select: { sceneNumber: true, project: { select: { userId: true } } } },
    },
  })
  const userId = clip?.scene.project.userId
  const storageKey = clip?.storageKey?.trim()
    || objectKeyFromStored(clip?.videoUrl)
    || objectKeyFromStored(clip?.rawVideoUrl)
  const providerUrl = [clip?.videoUrl, clip?.rawVideoUrl].find((url) => url?.trim()?.startsWith('http'))?.trim()
  if (!clip || !userId || (!storageKey && !providerUrl)) return
  const already = await db.asset.findFirst({
    where: { ownerId: userId, mediaKind: 'video', appearsInShots: { has: clipId } },
    select: { id: true },
  })
  if (already) return
  const { createLibraryAsset } = await import('@/lib/library/folders')
  const { readBoundary } = await import('@/lib/library/model')
  await createLibraryAsset({
    userId,
    projectId,
    kind: 'video',
    storageKey: storageKey || providerUrl || '',
    label: (clip.prompt || 'Shot').slice(0, 80),
    sceneId: clip.sceneId,
    sceneName: `Scene ${clip.scene.sceneNumber}`,
    shotId: clipId,
    transition: readBoundary(clip.boundary),
    pendingCopy: !storageKey,
  })
}

async function landMissingProjectClips(projectId: string): Promise<void> {
  const clips = await db.studioClip.findMany({
    where: {
      status: 'COMPLETED',
      scene: { projectId },
      OR: [{ videoUrl: { not: null } }, { rawVideoUrl: { not: null } }],
    },
    select: { id: true },
    take: 40,
  })
  for (const clip of clips) {
    await landCompletedClip(projectId, clip.id).catch((err) => {
      console.warn('[library] shot landing failed', err instanceof Error ? err.message : err)
    })
  }
}

export async function retryPendingLibraryCopies(userId: string, projectId?: string): Promise<number> {
  if (projectId) await landMissingProjectClips(projectId)
  const rows = await db.asset.findMany({
    where: { ownerId: userId, pendingCopy: true, mediaKind: 'video' },
    take: 20,
    select: { id: true, sourceRefs: true, appearsInShots: true },
  })
  for (const row of rows) {
    const url = row.sourceRefs.find((ref) => ref.trim().startsWith('http'))?.trim()
    const clipId = row.appearsInShots[0]
    if (!url || !clipId) continue
    const clip = await db.studioClip.findUnique({
      where: { id: clipId },
      select: { scene: { select: { projectId: true } } },
    })
    if (!clip) continue
    try {
      const stored = await persistClipVideoToR2(url, clip.scene.projectId, clipId)
      const storageKey = objectKeyFromStored(stored) ?? clipVideoKey(clip.scene.projectId, clipId)
      await db.asset.update({
        where: { id: row.id },
        data: { sourceRefs: [storageKey], pendingCopy: false },
      })
    } catch (err) {
      console.warn('[library] pending copy retry failed', err instanceof Error ? err.message : err)
    }
  }
  return db.asset.count({
    where: { ownerId: userId, pendingCopy: true, mediaKind: 'video' },
  })
}

export async function scheduleLibraryCopyRetry(userId: string, projectId: string): Promise<void> {
  const { renderQueue } = await import('@/lib/queue')
  await renderQueue.add('library-copy', { userId, projectId }, {
    jobId: `library-copy-${projectId}`,
    attempts: 4,
    backoff: { type: 'exponential', delay: 20_000 },
    removeOnComplete: true,
    removeOnFail: 10,
  }).catch((err) => {
    console.warn('[library] copy retry schedule failed', err instanceof Error ? err.message : err)
  })
}

export async function markChainBlock(
  projectId: string,
  shotIndex: number,
  chainBlock: string | null,
  reason?: string,
  priorFrame?: string,
): Promise<void> {
  const clipId = await clipIdForShotIndex(projectId, shotIndex)
  if (!clipId) return
  await db.studioClip.update({
    where: { id: clipId },
    data: {
      chainBlock,
      ...(reason ? { directionNotes: reason } : {}),
      ...(priorFrame ? { anchorFrameUrl: priorFrame, anchorSource: 'AUTO' as const } : {}),
    },
  })
}

export async function markBatchClipFailed(projectId: string, shotIndex: number): Promise<void> {
  const clipId = await clipIdForShotIndex(projectId, shotIndex)
  if (!clipId) return
  await db.studioClip.updateMany({
    where: {
      id: clipId,
      status: { notIn: ['COMPLETED', 'MANUAL'] },
      OR: [{ videoUrl: null }, { videoUrl: '' }],
    },
    data: { status: 'FAILED', generatingAt: null, generateClaimJobId: null, generateClaimedBy: null, generateClaimedAt: null },
  })
}
