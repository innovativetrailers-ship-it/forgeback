export const QUALITY_VERDICTS = ['pass', 'soft_fail', 'fail'] as const
export type QualityVerdict = (typeof QUALITY_VERDICTS)[number]

export const QUALITY_SOURCES = ['vision', 'rating'] as const
export type QualitySource = (typeof QUALITY_SOURCES)[number]

export const QUALITY_DIMENSIONS = [
  'character_drifted',
  'camera',
  'location',
  'off_prompt',
  'artifacts',
  'unexplained',
] as const
export type QualityDimension = (typeof QUALITY_DIMENSIONS)[number]

export interface QualityIntent {
  prompt: string
  characterIds?: string[]
  cameraIntent?: string
  locationId?: string | null
}

export interface QualityChecks {
  onIntent: boolean
  characterMatch?: number
  cameraMatch?: boolean
  locationMatch?: number
  artifacts: boolean
}

export interface QualityCheck {
  shotId?: string
  model?: string
  purpose?: string
  intent: QualityIntent
  checks: QualityChecks
  verdict: QualityVerdict
  reason?: string
  dimension?: QualityDimension
}

const FAIL_CHARACTER = 0.4
const SOFT_CHARACTER = 0.7
const FAIL_LOCATION = 0.4
const SOFT_LOCATION = 0.7

export function isQualityVerdict(value: string): value is QualityVerdict {
  return (QUALITY_VERDICTS as readonly string[]).includes(value)
}

export function isQualitySource(value: string): value is QualitySource {
  return (QUALITY_SOURCES as readonly string[]).includes(value)
}

export function isQualityDimension(value: string): value is QualityDimension {
  return (QUALITY_DIMENSIONS as readonly string[]).includes(value)
}

/** Cosine in 0–1. Empty or mismatched vectors return 0. */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length === 0 || a.length !== b.length) return 0
  let dot = 0
  let na = 0
  let nb = 0
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i]
    na += a[i] * a[i]
    nb += b[i] * b[i]
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb)
  if (denom === 0) return 0
  return Math.max(0, Math.min(1, dot / denom))
}

/**
 * Numeric first pass when both embeddings exist (reference vs output face).
 * Undefined when either vector is missing — Vision is then the live check.
 */
export function firstPassCharacterMatch(
  referenceEmbedding: number[] | undefined,
  outputEmbedding: number[] | undefined,
): number | undefined {
  if (!referenceEmbedding?.length || !outputEmbedding?.length) return undefined
  if (referenceEmbedding.length !== outputEmbedding.length) return undefined
  return cosineSimilarity(referenceEmbedding, outputEmbedding)
}

export function blendCharacterMatch(
  visionMatch: number | undefined,
  numericMatch: number | undefined,
): number | undefined {
  if (numericMatch == null) return visionMatch
  if (visionMatch == null) return numericMatch
  return Math.min(visionMatch, numericMatch)
}

export function verdictFromChecks(checks: QualityChecks): QualityVerdict {
  const character = checks.characterMatch
  const location = checks.locationMatch
  if (!checks.onIntent || checks.artifacts) return 'fail'
  if (character != null && character < FAIL_CHARACTER) return 'fail'
  if (location != null && location < FAIL_LOCATION) return 'fail'
  if (checks.cameraMatch === false) return 'soft_fail'
  if (character != null && character < SOFT_CHARACTER) return 'soft_fail'
  if (location != null && location < SOFT_LOCATION) return 'soft_fail'
  return 'pass'
}

export function dimensionFromChecks(checks: QualityChecks): QualityDimension {
  if (checks.characterMatch != null && checks.characterMatch < SOFT_CHARACTER) return 'character_drifted'
  if (checks.cameraMatch === false) return 'camera'
  if (checks.locationMatch != null && checks.locationMatch < SOFT_LOCATION) return 'location'
  if (!checks.onIntent) return 'off_prompt'
  if (checks.artifacts) return 'artifacts'
  return 'unexplained'
}

export function reasonFromChecks(checks: QualityChecks, verdict: QualityVerdict): string | undefined {
  if (verdict === 'pass') return undefined
  if (checks.characterMatch != null && checks.characterMatch < SOFT_CHARACTER) {
    return `character face drifted (${checks.characterMatch.toFixed(2)})`
  }
  if (checks.cameraMatch === false) return 'camera static, requested move did not land'
  if (checks.locationMatch != null && checks.locationMatch < SOFT_LOCATION) {
    return `location mismatch (${checks.locationMatch.toFixed(2)})`
  }
  if (!checks.onIntent) return 'output is off prompt'
  if (checks.artifacts) return 'warping/jitter/degradation'
  return undefined
}

export function qualityCheckFromChecks(
  checks: QualityChecks,
  intent: QualityIntent,
  meta?: { shotId?: string; model?: string; purpose?: string; reason?: string },
): QualityCheck {
  const verdict = verdictFromChecks(checks)
  const reason = verdict === 'pass' ? undefined : (meta?.reason?.trim() || reasonFromChecks(checks, verdict))
  const dimension = verdict === 'pass' ? undefined : (reason ? dimensionFromChecks(checks) : 'unexplained')
  return {
    shotId: meta?.shotId,
    model: meta?.model,
    purpose: meta?.purpose,
    intent,
    checks,
    verdict,
    reason,
    dimension,
  }
}

export function isUnexplainedQuality(verdict: QualityVerdict, reason?: string | null): boolean {
  return verdict !== 'pass' && !reason?.trim()
}

export function qualityPassed(verdict: QualityVerdict): boolean {
  return verdict === 'pass'
}

/** Map a QualityCheck onto the legacy Job-4 / chain score shape. */
export function qualityScoreFromCheck(check: QualityCheck): {
  overall: number
  facialFidelity: number
  motionSmoothness: number
  artifactLevel: number
  passed: boolean
} {
  const c = check.checks
  const facial = c.characterMatch ?? (c.onIntent ? 0.85 : 0.4)
  const motion = c.cameraMatch === false ? 0.4 : 0.85
  const artifactLevel = c.artifacts ? 0.3 : 0.9
  const location = c.locationMatch ?? 0.85
  const overall = ((c.onIntent ? 0.9 : 0.3) + facial + motion + artifactLevel + location) / 5
  return {
    overall,
    facialFidelity: facial,
    motionSmoothness: motion,
    artifactLevel,
    passed: qualityPassed(check.verdict),
  }
}

export function dimensionFromRatingReason(reason: string | undefined): QualityDimension {
  if (reason === 'character_drifted') return 'character_drifted'
  if (reason === 'wrong_motion') return 'camera'
  if (reason === 'off_prompt') return 'off_prompt'
  if (reason === 'artifacts') return 'artifacts'
  if (reason === 'bad_lighting' || reason === 'wrong_style') return 'location'
  return 'unexplained'
}
