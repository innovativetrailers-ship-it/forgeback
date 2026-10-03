import type { ShotPurpose } from './premiseLock'

type CostTier = 'draft' | 'standard' | 'premium'

export const RATING_DIMENSIONS = [
  'character_held',
  'move_landed',
  'quality',
  'lipsync_natural',
  'motion_natural',
  'matched_intent',
] as const
export type RatingDimension = (typeof RATING_DIMENSIONS)[number]

export const FAIL_REASONS = [
  'character_drifted',
  'wrong_motion',
  'bad_lighting',
  'off_prompt',
  'artifacts',
  'content_flagged',
  'wrong_style',
  'audio_off',
  'other',
] as const
export type FailReason = (typeof FAIL_REASONS)[number]

export interface ShotRating {
  shotId: string
  model: string
  mode?: string
  purpose: ShotPurpose
  score: number
  dimension?: RatingDimension
  worked: boolean
  reason?: FailReason
  note?: string
  filmId?: string
  sceneId?: string
  ratedAt?: string
}

export interface TasteProfile {
  modelPreference: Record<string, number>
  dimensionSensitivity: Record<string, number>
  qualityVsSpeedLean: number
}

export function emptyTaste(): TasteProfile {
  return { modelPreference: {}, dimensionSensitivity: {}, qualityVsSpeedLean: 0 }
}

export function isFailReason(value: string): value is FailReason {
  return (FAIL_REASONS as readonly string[]).includes(value)
}

export function isRatingDimension(value: string): value is RatingDimension {
  return (RATING_DIMENSIONS as readonly string[]).includes(value)
}

/** 👍 = +2, 👎 = -2. 1–5 maps onto the same scale. */
export function signalFromScore(score: number): number {
  const clamped = Math.max(1, Math.min(5, Math.round(score)))
  return clamped - 3
}

export function scoreFromThumbs(thumbs: 'up' | 'down'): number {
  return thumbs === 'up' ? 5 : 1
}

export function ratingWorked(score: number): boolean {
  return score >= 4
}

export function ratingPromptFor(purpose: ShotPurpose): string {
  switch (purpose) {
    case 'consistency':
      return 'Did the character look consistent?'
    case 'camera':
      return 'Did the camera move land?'
    case 'dialogue':
      return 'Did the speech feel natural?'
    case 'motion':
      return 'Did the motion look right?'
    case 'continuity':
      return 'Did this continue the previous shot?'
    case 'hero':
      return 'Did this shot match the intent?'
    case 'draft':
      return 'Was this draft usable?'
    case 'stylized':
      return 'Did the stylized look land?'
    default:
      return 'Was this shot usable?'
  }
}

export function failReasonsFor(purpose: ShotPurpose): Array<{ id: FailReason; label: string }> {
  const extra: Array<{ id: FailReason; label: string }> = [
    { id: 'off_prompt', label: 'Off prompt' },
    { id: 'artifacts', label: 'Artifacts' },
    { id: 'other', label: 'Other' },
  ]
  const primary: Record<ShotPurpose, Array<{ id: FailReason; label: string }>> = {
    consistency: [{ id: 'character_drifted', label: 'Character drifted' }],
    camera: [{ id: 'wrong_motion', label: "Move didn't land" }],
    dialogue: [{ id: 'audio_off', label: 'Audio off' }],
    motion: [{ id: 'wrong_motion', label: 'Wrong motion' }],
    continuity: [{ id: 'other', label: "Didn't continue" }],
    hero: [{ id: 'off_prompt', label: 'Missed the intent' }],
    fill: [{ id: 'bad_lighting', label: 'Bad lighting' }, { id: 'wrong_style', label: 'Wrong style' }],
    draft: [{ id: 'artifacts', label: 'Too rough' }],
    stylized: [{ id: 'wrong_style', label: 'Wrong style' }],
  }
  const seen = new Set<string>()
  return [...(primary[purpose] ?? []), ...extra].filter((chip) => {
    if (seen.has(chip.id)) return false
    seen.add(chip.id)
    return true
  })
}

export function foldTaste(
  profile: TasteProfile,
  rating: { model: string; worked: boolean; reason?: string; score: number },
  costTier: CostTier,
): TasteProfile {
  const next: TasteProfile = {
    modelPreference: { ...profile.modelPreference },
    dimensionSensitivity: { ...profile.dimensionSensitivity },
    qualityVsSpeedLean: profile.qualityVsSpeedLean,
  }
  const delta = rating.worked ? 1 : -1
  next.modelPreference[rating.model] = (next.modelPreference[rating.model] ?? 0) + delta
  if (rating.reason) {
    next.dimensionSensitivity[rating.reason] = (next.dimensionSensitivity[rating.reason] ?? 0) + (rating.worked ? 0 : 1)
  }
  if (!rating.worked && costTier === 'premium') next.qualityVsSpeedLean -= 0.25
  if (!rating.worked && costTier === 'draft') next.qualityVsSpeedLean += 0.25
  if (rating.worked && costTier === 'premium') next.qualityVsSpeedLean += 0.1
  if (rating.worked && costTier === 'draft') next.qualityVsSpeedLean -= 0.1
  next.qualityVsSpeedLean = Math.max(-1, Math.min(1, next.qualityVsSpeedLean))
  return next
}

export function tasteBoost(
  modelId: string,
  costTier: CostTier,
  purpose: ShotPurpose,
  taste: TasteProfile | undefined,
): number {
  if (!taste) return 0
  const pref = taste.modelPreference[modelId] ?? 0
  const prefNorm = Math.max(-1, Math.min(1, pref / 4))
  const tierSign = costTier === 'premium' ? 1 : costTier === 'draft' ? -1 : 0
  const lean = taste.qualityVsSpeedLean * tierSign * 0.1
  const sensitivity = purpose === 'consistency'
    ? (taste.dimensionSensitivity.character_drifted ?? 0) * 0.03
    : purpose === 'motion'
      ? (taste.dimensionSensitivity.wrong_motion ?? 0) * 0.03
      : purpose === 'dialogue'
        ? (taste.dimensionSensitivity.audio_off ?? 0) * 0.03
        : 0
  return prefNorm * 0.2 + lean + Math.min(0.15, sensitivity)
}
