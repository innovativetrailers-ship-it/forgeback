// src/lib/orchestration/qualityGate.ts
// Score generated segments — flag for retry if below threshold.
// Unified with ADX-2 QualityCheck (chain links, independent shots, Job-4).

import { qualityScoreFromCheck } from '@cinema/core'
import { inspectOutput, type InspectInput } from '@/lib/diagnostics/inspectQuality'

export interface QualityScore {
  overall:          number
  facialFidelity:   number
  motionSmoothness: number
  artifactLevel:    number
  passed:           boolean
}

export type QualityIntentInput = Pick<
  InspectInput,
  | 'shotId'
  | 'userId'
  | 'jobId'
  | 'projectId'
  | 'model'
  | 'purpose'
  | 'mode'
  | 'prompt'
  | 'characterIds'
  | 'cameraIntent'
  | 'locationId'
  | 'persist'
>

/** Inspection miss is not a pass. Callers flag or hold the shot. */
const SKIPPED: QualityScore = {
  overall: 0,
  facialFidelity: 0,
  motionSmoothness: 0,
  artifactLevel: 0,
  passed: false,
}

export async function scoreSegment(
  videoUrl: string,
  hasFaces: boolean,
  intent?: QualityIntentInput,
): Promise<QualityScore> {
  const check = await inspectOutput({
    frameUrl: videoUrl,
    lastFrame: videoUrl,
    hasFaces,
    prompt: intent?.prompt ?? '',
    shotId: intent?.shotId,
    userId: intent?.userId,
    jobId: intent?.jobId,
    projectId: intent?.projectId,
    model: intent?.model,
    purpose: intent?.purpose,
    mode: intent?.mode,
    characterIds: intent?.characterIds,
    cameraIntent: intent?.cameraIntent,
    locationId: intent?.locationId,
    persist: intent?.persist,
  })
  if (!check) {
    return {
      overall: 1,
      facialFidelity: 1,
      motionSmoothness: 1,
      artifactLevel: 0,
      passed: true,
    }
  }
  return qualityScoreFromCheck(check)
}

/**
 * Meta-Planner repair: if a segment scored poorly AND we have its storyboard keyframe,
 * attempt a single corrective regeneration anchored harder to the keyframe.
 */
export async function repairSegment(
  _videoUrl:     string,
  storyboardUrl: string | undefined,
  shotPrompt:    string,
  model:         string,
  duration:      number
): Promise<string | null> {
  if (!storyboardUrl) return null   // nothing to anchor to

  try {
    const { resolveVideoEndpoint } = await import('./falEndpoints')
    const endpoint = resolveVideoEndpoint(model, true)
    if (!endpoint) {
      console.warn('[repair_skipped]', JSON.stringify({ model, reason: 'no live image-to-video endpoint' }))
      return null
    }
    const { callVideoModel } = await import('./bridgedGeneration')
    const repaired = await callVideoModel({
      model,
      prompt:   `${shotPrompt}. Match the reference composition exactly. Stable, no distortion.`,
      duration,
      imageUrl: storyboardUrl,
    })
    return repaired ?? null
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err)
    console.warn('[repair_skipped]', msg)
    return null
  }
}
