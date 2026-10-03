import { db } from '@/lib/db'
import { extractVideoUrl } from '@/lib/fal/client'
import {
  parseFalSubmission,
  pollFalStatusOnce,
  type FalSubmission,
} from '@/lib/fal/falQueue'
import { getOrderedClips } from './advanceChain'
import { persistCompletedClip } from './batchClipSync'

const SUBMISSION_MARKER = '__fal_submission__'

export type PriorFal =
  | { kind: 'video'; url: string; submission: FalSubmission }
  | { kind: 'open'; submission: FalSubmission }
  | { kind: 'failed'; submission: FalSubmission }
  | { kind: 'none' }

async function clipAtPlanIndex(projectId: string, planIndex: number) {
  const ordered = await getOrderedClips(db, projectId)
  return ordered.find((clip) => clip.shotNumber - 1 === planIndex) ?? null
}

async function rememberSubmission(clipId: string, submission: FalSubmission): Promise<void> {
  await db.studioClip.update({
    where: { id: clipId },
    data: {
      falRequestId: submission.requestId,
      falSubmission: JSON.stringify(submission),
    },
  }).catch((err) => {
    console.warn('[director] fal submission not stored', {
      clipId,
      error: err instanceof Error ? err.message : String(err),
    })
  })
}

export async function rememberFalSubmission(
  projectId: string,
  planIndex: number,
  submission: FalSubmission,
): Promise<void> {
  const clip = await clipAtPlanIndex(projectId, planIndex)
  if (!clip) return
  await rememberSubmission(clip.id, submission)
}

async function unclaimedSubmission(
  projectId: string,
  planIndex: number,
  clipId: string,
): Promise<FalSubmission | null> {
  const jobs = await db.renderJob.findMany({
    where: { projectId },
    orderBy: { createdAt: 'desc' },
    take: 5,
    select: { id: true },
  })
  if (jobs.length === 0) return null

  const rows = await db.segmentCheckpoint.findMany({
    where: {
      jobId: { in: jobs.map((job) => job.id) },
      modelUsed: SUBMISSION_MARKER,
    },
    orderBy: { createdAt: 'desc' },
  })
  const owned = await db.studioClip.findMany({
    where: { scene: { projectId }, falRequestId: { not: null }, id: { not: clipId } },
    select: { falRequestId: true },
  })
  const taken = new Set(owned.map((row) => row.falRequestId).filter((id): id is string => Boolean(id)))
  const available = rows.filter((row) => {
    const parsed = parseFalSubmission(row.videoUrl)
    return parsed && !taken.has(parsed.requestId)
  })
  const exact = available.find((row) => row.shotId === planIndex)
  if (exact) return parseFalSubmission(exact.videoUrl)

  const unfinished = await db.studioClip.count({
    where: {
      scene: { projectId },
      status: { in: ['FAILED', 'GENERATING'] },
      OR: [{ videoUrl: null }, { videoUrl: '' }],
      falRequestId: null,
    },
  })
  if (unfinished !== 1 || available.length !== 1) return null
  return parseFalSubmission(available[0].videoUrl)
}

async function submissionForClip(
  projectId: string,
  planIndex: number,
  clip: { id: string; falSubmission: string | null },
): Promise<FalSubmission | null> {
  const stored = clip.falSubmission ? parseFalSubmission(clip.falSubmission) : null
  if (stored) return stored
  const adopted = await unclaimedSubmission(projectId, planIndex, clip.id)
  if (adopted) await rememberSubmission(clip.id, adopted)
  return adopted
}

function classifyPoll(
  submission: FalSubmission,
  polled: { status: string; data?: unknown; error?: string },
): PriorFal {
  if (polled.status === 'COMPLETED') {
    const url = extractVideoUrl(polled.data)?.trim()
    if (url) return { kind: 'video', url, submission }
    return { kind: 'open', submission }
  }
  if (polled.status === 'IN_QUEUE' || polled.status === 'IN_PROGRESS') {
    return { kind: 'open', submission }
  }
  const error = polled.error ?? ''
  if (error.startsWith('FAL generation failed') || error.includes('404')) {
    return { kind: 'failed', submission }
  }
  return { kind: 'open', submission }
}

export async function readPriorFal(projectId: string, planIndex: number): Promise<PriorFal> {
  const clip = await clipAtPlanIndex(projectId, planIndex)
  if (!clip) return { kind: 'none' }
  const submission = await submissionForClip(projectId, planIndex, clip)
  if (!submission) return { kind: 'none' }
  try {
    const polled = await pollFalStatusOnce(submission)
    return classifyPoll(submission, polled)
  } catch (err) {
    console.warn('[director] fal status poll failed', {
      clipId: clip.id,
      error: err instanceof Error ? err.message : String(err),
    })
    return { kind: 'open', submission }
  }
}

/** One status poll per unfinished clip. A completed FAL request is written back. No new submit. */
export async function recoverOutstandingFalClips(projectId: string): Promise<number> {
  const ordered = await getOrderedClips(db, projectId)
  let recovered = 0
  for (const clip of ordered) {
    if (clip.status !== 'FAILED' && clip.status !== 'GENERATING') continue
    if (clip.videoUrl?.trim()) continue
    const prior = await readPriorFal(projectId, clip.shotNumber - 1)
    if (prior.kind !== 'video') continue
    await persistCompletedClip(clip.id, projectId, prior.url)
    console.log('[director] fal_recovered', { clipId: clip.id, requestId: prior.submission.requestId })
    recovered++
  }
  return recovered
}
