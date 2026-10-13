// src/lib/orchestration/fastEstimate.ts
// Instant cost + render-time estimate — zero API calls.
// Used by the Vercel route to stay well under its 30s maxDuration.

import { MODEL_COSTS } from '@/lib/routing/engineRegistry'

/**
 * Estimate credit cost WITHOUT calling Claude.
 * Uses the average rate across the selected model pool, weighted conservatively.
 * The worker reconciles the exact cost after real shot breakdown and refunds any difference.
 */
export function fastEstimateCost(
  selectedModels: string[],
  duration:       number
): number {
  if (selectedModels.length === 0) return Math.ceil((2 / 5) * duration)

  const avgRate = selectedModels.reduce(
    (sum, m) => sum + (MODEL_COSTS[m] ?? 10), 0
  ) / selectedModels.length

  const videoCost      = Math.ceil((avgRate / 5) * duration)
  const patientZeroCost = 10  // reference image generation buffer

  // Storyboard keyframes (~2cr each, Nano Banana Pro) — one per estimated shot
  const estimatedShots  = Math.max(1, Math.ceil(duration / 6))
  const storyboardCost  = estimatedShots * 2

  return videoCost + storyboardCost + patientZeroCost
}

/**
 * Estimate render time in seconds — used for the initial ETA before real progress.
 * Based on observed fal.ai generation times per model tier.
 */
export function estimateRenderSeconds(
  selectedModels: string[],
  duration:       number
): number {
  const estimatedSegments = Math.max(1, Math.ceil(duration / 6))
  const perSegment        = 45  // seconds — premium models are slower, drafts faster
  return (estimatedSegments * perSegment) + 20 + 30  // +20s patient zero, +30s stitching
}
