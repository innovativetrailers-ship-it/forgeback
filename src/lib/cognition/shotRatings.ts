import {
  dimensionFromRatingReason,
  emptyTaste,
  foldTaste,
  getModelKnowledge,
  isFailReason,
  isRatingDimension,
  isShotPurpose,
  qualityCheckFromChecks,
  ratingPromptFor,
  ratingWorked,
  scoreFromThumbs,
  signalFromScore,
  type FailReason,
  type RatingDimension,
  type ShotPurpose,
  type TasteProfile,
} from '@cinema/core'
import { db } from '@/lib/db'
import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'
import { recordShotOutcome } from './learnOutcomes'

function asRecord(value: unknown): Record<string, number> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  const out: Record<string, number> = {}
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === 'number' && Number.isFinite(entry)) out[key] = entry
  }
  return out
}

export async function tasteProfileFor(userId: string): Promise<TasteProfile> {
  const row = await db.userTasteProfile.findUnique({ where: { userId } })
  if (!row) return emptyTaste()
  return {
    modelPreference: asRecord(row.modelPreference),
    dimensionSensitivity: asRecord(row.dimensionSensitivity),
    qualityVsSpeedLean: row.qualityVsSpeedLean,
  }
}

async function persistTaste(userId: string, rating: {
  model: string
  worked: boolean
  reason?: string
  score: number
}): Promise<TasteProfile> {
  const current = await tasteProfileFor(userId)
  const tier = getModelKnowledge(rating.model)?.cost.tier ?? 'standard'
  const next = foldTaste(current, rating, tier)
  await db.userTasteProfile.upsert({
    where: { userId },
    create: {
      userId,
      modelPreference: next.modelPreference,
      dimensionSensitivity: next.dimensionSensitivity,
      qualityVsSpeedLean: next.qualityVsSpeedLean,
    },
    update: {
      modelPreference: next.modelPreference,
      dimensionSensitivity: next.dimensionSensitivity,
      qualityVsSpeedLean: next.qualityVsSpeedLean,
    },
  })
  return next
}

export async function rateShot(input: {
  userId: string
  shotId: string
  thumbs?: 'up' | 'down'
  score?: number
  reason?: string
  dimension?: string
  note?: string
}): Promise<{ purpose: ShotPurpose; score: number; worked: boolean; reason: FailReason | null }> {
  const clip = await db.studioClip.findFirst({
    where: { id: input.shotId, scene: { project: { userId: input.userId } } },
    include: { scene: { select: { id: true, projectId: true } } },
  })
  if (!clip) throw new Error('Shot not found')
  if (clip.status !== 'COMPLETED' && clip.status !== 'MANUAL') {
    throw new Error('Rate a finished shot')
  }

  const score = input.thumbs
    ? scoreFromThumbs(input.thumbs)
    : Math.max(1, Math.min(5, Math.round(input.score ?? 3)))
  const worked = ratingWorked(score)
  const purpose: ShotPurpose = clip.purpose && isShotPurpose(clip.purpose) ? clip.purpose : 'hero'
  const reason = input.reason && isFailReason(input.reason) ? input.reason : undefined
  const dimension = input.dimension && isRatingDimension(input.dimension) ? input.dimension : undefined
  const model = clip.assignedModel?.trim() || refuseSilentModelSwap(clip.id, 'ltx-2.3-fast')
  const mode = clip.delegatedMode ?? undefined
  const contextualReason = reason

  await db.shotRating.upsert({
    where: { userId_shotId: { userId: input.userId, shotId: clip.id } },
    create: {
      userId: input.userId,
      shotId: clip.id,
      filmId: clip.scene.projectId,
      sceneId: clip.scene.id,
      model,
      mode,
      purpose,
      score,
      dimension: dimension ?? null,
      worked,
      reason: contextualReason ?? null,
      note: input.note?.trim() || null,
    },
    update: {
      model,
      mode,
      purpose,
      score,
      dimension: dimension ?? null,
      worked,
      reason: contextualReason ?? null,
      note: input.note?.trim() || null,
      ratedAt: new Date(),
    },
  })

  await recordShotOutcome({
    userId: input.userId,
    shotId: clip.id,
    signal: String(score),
    source: 'rating',
    reason: contextualReason,
    model,
    purpose,
    mode,
    reward: signalFromScore(score),
  })

  await persistTaste(input.userId, { model, worked, reason: contextualReason, score })

  try {
    const { persistQualityLog } = await import('@/lib/diagnostics/inspectQuality')
    const check = qualityCheckFromChecks(
      {
        onIntent: worked,
        artifacts: contextualReason === 'artifacts',
        characterMatch: contextualReason === 'character_drifted' ? 0.2 : undefined,
        cameraMatch: contextualReason === 'wrong_motion' ? false : undefined,
      },
      { prompt: clip.prompt, characterIds: clip.characterIds, locationId: clip.locationId },
      {
        shotId: clip.id,
        model,
        purpose,
        reason: contextualReason,
      },
    )
    await persistQualityLog({
      check: {
        ...check,
        verdict: worked ? 'pass' : 'fail',
        dimension: worked ? undefined : dimensionFromRatingReason(contextualReason),
        reason: contextualReason,
      },
      source: 'rating',
      userId: input.userId,
      mode,
    })
  } catch (err) {
    console.warn('[quality] rating log skipped', err instanceof Error ? err.message : err)
  }

  return { purpose, score, worked, reason: contextualReason ?? null }
}

export async function rateFilm(input: {
  userId: string
  projectId: string
  score: number
  note?: string
}): Promise<void> {
  const project = await db.project.findFirst({
    where: { id: input.projectId, userId: input.userId },
    select: { id: true },
  })
  if (!project) throw new Error('Project not found')
  const score = Math.max(1, Math.min(5, Math.round(input.score)))
  await db.filmRating.upsert({
    where: { userId_projectId: { userId: input.userId, projectId: project.id } },
    create: { userId: input.userId, projectId: project.id, score, note: input.note?.trim() || null },
    update: { score, note: input.note?.trim() || null, ratedAt: new Date() },
  })
}

export function ratingPrompt(purpose: string): string {
  return ratingPromptFor(isShotPurpose(purpose) ? purpose : 'hero')
}
