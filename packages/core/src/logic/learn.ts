import { isShotPurpose, type ShotPurpose } from './premiseLock'

/**
 * RLAIF learning. Behavioural (and later rating) outcomes update Layer 3
 * per (model, purpose). queryModelRAG blends this with static knowledge.
 */

export type OutcomeSource = 'behaviour' | 'rating'

export interface ShotOutcome {
  shotId?: string
  model: string
  mode?: string
  purpose: ShotPurpose
  signal: number
  source: OutcomeSource
  reason?: string
}

export interface PurposeScore {
  worked: number
  total: number
  score: number
}

export const CIRCUIT_BREAK_SCORE = 0.25
export const CIRCUIT_BREAK_N = 4
export const LEARNED_HALF_LIFE = 8
export const RATING_ALPHA = 0.55

export const BEHAVIOUR_SIGNAL: Record<string, number> = {
  export: 1,
  exported: 1,
  kept: 1,
  regenerate: -1,
  regenerated: -1,
  approved_at_gate: 0.5,
  failed: -1,
  watch_complete: 0.5,
  watched_through: 0.5,
  discard: -0.5,
  discarded: -0.5,
  thumbs_up: 0.8,
  thumbs_down: -0.8,
}

/** OR-05 reasons map onto a purpose so a penalty is not universal. */
export const RATING_REASON_PURPOSE: Record<string, ShotPurpose> = {
  character_drifted: 'consistency',
  identity_break: 'consistency',
  face_inconsistent: 'consistency',
  wrong_motion: 'motion',
  motion_fail: 'motion',
  camera_miss: 'camera',
  framing: 'camera',
  audio_miss: 'dialogue',
  lip_sync: 'dialogue',
  audio_off: 'dialogue',
  continuity_break: 'continuity',
  cut_jump: 'continuity',
  bad_lighting: 'fill',
  off_prompt: 'hero',
  artifacts: 'hero',
  content_flagged: 'draft',
  wrong_style: 'fill',
}

export function purposeForRatingReason(reason: string | undefined, fallback: ShotPurpose): ShotPurpose {
  if (!reason) return fallback
  const mapped = RATING_REASON_PURPOSE[reason]
  if (mapped) return mapped
  if (isShotPurpose(reason)) return reason
  return fallback
}

export function signalForKind(kind: string, source: OutcomeSource = 'behaviour'): number {
  if (source === 'rating') {
    if (kind === 'thumbs_up' || kind === 'up') return 2
    if (kind === 'thumbs_down' || kind === 'down') return -2
    const n = Number(kind)
    if (Number.isFinite(n) && n >= 1 && n <= 5) return n - 3
  }
  return BEHAVIOUR_SIGNAL[kind] ?? 0
}

export function unitScore(signal: number): number {
  return Math.max(0, Math.min(1, (signal + 1) / 2))
}

export function learnedBlendWeight(n: number): number {
  if (n <= 0) return 0
  return n / (n + LEARNED_HALF_LIFE)
}

export function isCircuitOpen(cell: PurposeScore): boolean {
  return cell.total >= CIRCUIT_BREAK_N && cell.score < CIRCUIT_BREAK_SCORE
}

export function applyOutcome(cell: PurposeScore, signal: number, source: OutcomeSource = 'behaviour'): PurposeScore {
  const sample = unitScore(signal)
  const n = cell.total + 1
  const alpha = source === 'rating' ? RATING_ALPHA : Math.max(0.3, 1 / n)
  const prior = cell.total > 0 ? cell.score : 0.5
  const score = Number((alpha * sample + (1 - alpha) * prior).toFixed(4))
  return {
    worked: cell.worked + (signal > 0 ? 1 : 0),
    total: n,
    score,
  }
}

export function emptyPurposeScore(): PurposeScore {
  return { worked: 0, total: 0, score: 0 }
}
