import { logCaught } from '@/lib/diagnostics/caught'
/**
 * Layer 3 — segment checkpoints for resume-without-repay.
 */

import { db } from '@/lib/db'
import {
  parseFalSubmission,
  serializeFalSubmission,
  type FalSubmission,
} from '@/lib/fal/falQueue'

const FAL_SUBMISSION_MARKER = '__fal_submission__'

export interface SegmentCheckpointRow {
  segmentId: string
  shotId: number
  videoUrl: string
  modelUsed: string
  cost: number
  qaPassed: boolean
  anchorFrame?: string | null
}

export async function loadCheckpoint(
  jobId: string,
  segmentId: string,
): Promise<SegmentCheckpointRow | null> {
  const row = await db.segmentCheckpoint.findUnique({
    where: { jobId_segmentId: { jobId, segmentId } },
  })
  if (!row) return null
  return {
    segmentId: row.segmentId,
    shotId: row.shotId,
    videoUrl: row.videoUrl,
    modelUsed: row.modelUsed,
    cost: row.cost,
    qaPassed: row.qaPassed,
    anchorFrame: row.anchorFrame,
  }
}

export async function saveCheckpoint(input: {
  jobId: string
  segmentId: string
  shotId: number
  videoUrl: string
  modelUsed: string
  cost: number
  qaPassed?: boolean
  anchorFrame?: string
}): Promise<void> {
  await db.segmentCheckpoint.upsert({
    where: { jobId_segmentId: { jobId: input.jobId, segmentId: input.segmentId } },
    create: {
      jobId: input.jobId,
      segmentId: input.segmentId,
      shotId: input.shotId,
      videoUrl: input.videoUrl,
      modelUsed: input.modelUsed,
      cost: input.cost,
      qaPassed: input.qaPassed ?? true,
      anchorFrame: input.anchorFrame,
    },
    update: {
      videoUrl: input.videoUrl,
      modelUsed: input.modelUsed,
      cost: input.cost,
      qaPassed: input.qaPassed ?? true,
      anchorFrame: input.anchorFrame,
    },
  })
}

export async function loadKeyframeCheckpoint(
  jobId: string,
  shotIndex: number,
): Promise<string | null> {
  const row = await loadCheckpoint(jobId, `keyframe_${shotIndex}`)
  return row?.videoUrl ?? null
}

export async function saveKeyframeCheckpoint(
  jobId: string,
  shotIndex: number,
  url: string,
): Promise<void> {
  await saveCheckpoint({
    jobId,
    segmentId: `keyframe_${shotIndex}`,
    shotId: shotIndex,
    videoUrl: url,
    modelUsed: 'keyframe',
    cost: 0,
    qaPassed: true,
  })
}

export async function loadSubmissionCheckpoint(
  jobId: string,
  segmentId: string,
): Promise<FalSubmission | null> {
  const row = await loadCheckpoint(jobId, `submission_${segmentId}`)
  if (!row || row.modelUsed !== FAL_SUBMISSION_MARKER) return null
  return parseFalSubmission(row.videoUrl)
}

export async function saveSubmissionCheckpoint(
  jobId: string,
  segmentId: string,
  shotId: number,
  submission: FalSubmission,
): Promise<void> {
  await saveCheckpoint({
    jobId,
    segmentId: `submission_${segmentId}`,
    shotId,
    videoUrl: serializeFalSubmission(submission),
    modelUsed: FAL_SUBMISSION_MARKER,
    cost: 0,
    qaPassed: false,
  })
}

export async function clearSubmissionCheckpoint(
  jobId: string,
  segmentId: string,
): Promise<void> {
  await db.segmentCheckpoint.delete({
    where: { jobId_segmentId: { jobId, segmentId: `submission_${segmentId}` } },
  }).catch((err) => logCaught('lib/orchestration/checkpoints', err))
}

const DECOMPOSITION_SEGMENT_ID = 'decomposition'
const DECOMPOSITION_MARKER = '__decomposition__'

export async function saveDecompositionCheckpoint(
  jobId: string,
  shots: unknown[],
): Promise<void> {
  await saveCheckpoint({
    jobId,
    segmentId: DECOMPOSITION_SEGMENT_ID,
    shotId: -1,
    videoUrl: JSON.stringify(shots),
    modelUsed: DECOMPOSITION_MARKER,
    cost: 0,
    qaPassed: true,
  })
}

export async function loadDecompositionCheckpoint(jobId: string): Promise<unknown[] | null> {
  const row = await loadCheckpoint(jobId, DECOMPOSITION_SEGMENT_ID)
  if (!row || row.modelUsed !== DECOMPOSITION_MARKER) return null
  try {
    const parsed = JSON.parse(row.videoUrl) as unknown
    return Array.isArray(parsed) ? parsed : null
  } catch (err) {
    console.warn('[checkpoint] decomposition unreadable', err instanceof Error ? err.message : err)
    return null
  }
}

export async function loadWizardRefs(jobId: string): Promise<{ characters: Array<{ name: string; imageUrl: string }>; locations: Array<{ name: string; imageUrl: string }> } | null> {
  const job = await db.renderJob.findUnique({ where: { id: jobId }, select: { metadata: true } })
  const refs = job?.metadata && typeof job.metadata === 'object'
    ? (job.metadata as { wizardRefs?: unknown }).wizardRefs
    : null
  if (!refs || typeof refs !== 'object') return null
  const row = refs as { characters?: unknown; locations?: unknown }
  const characters = Array.isArray(row.characters)
    ? row.characters.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const rec = item as { name?: unknown; imageUrl?: unknown }
      return typeof rec.name === 'string' && typeof rec.imageUrl === 'string'
        ? [{ name: rec.name, imageUrl: rec.imageUrl }]
        : []
    })
    : []
  const locations = Array.isArray(row.locations)
    ? row.locations.flatMap((item) => {
      if (!item || typeof item !== 'object') return []
      const rec = item as { name?: unknown; imageUrl?: unknown }
      return typeof rec.name === 'string' && typeof rec.imageUrl === 'string'
        ? [{ name: rec.name, imageUrl: rec.imageUrl }]
        : []
    })
    : []
  return { characters, locations }
}

export async function saveWizardRefs(
  jobId: string,
  assets: { characters: Array<{ name: string; imageUrl: string }>; locations: Array<{ name: string; imageUrl: string }> },
): Promise<void> {
  const job = await db.renderJob.findUnique({ where: { id: jobId }, select: { metadata: true } })
  const meta = (job?.metadata && typeof job.metadata === 'object' ? job.metadata : {}) as Record<string, unknown>
  await db.renderJob.update({
    where: { id: jobId },
    data: { metadata: { ...meta, wizardRefs: assets } },
  })
}

export async function clearDecompositionCheckpoint(jobId: string): Promise<void> {
  await db.segmentCheckpoint.delete({
    where: { jobId_segmentId: { jobId, segmentId: DECOMPOSITION_SEGMENT_ID } },
  }).catch((err) => logCaught('lib/orchestration/checkpoints', err))
}

export async function listCheckpoints(jobId: string): Promise<SegmentCheckpointRow[]> {
  const rows = await db.segmentCheckpoint.findMany({ where: { jobId } })
  return rows.map((row) => ({
    segmentId: row.segmentId,
    shotId: row.shotId,
    videoUrl: row.videoUrl,
    modelUsed: row.modelUsed,
    cost: row.cost,
    qaPassed: row.qaPassed,
    anchorFrame: row.anchorFrame,
  }))
}
