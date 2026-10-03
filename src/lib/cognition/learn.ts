import { logCaught } from '@/lib/diagnostics/caught'
// Post-render learning loop: procedural routing policy + outcome episode +
// occasional episodic→semantic consolidation. Entirely non-fatal.

import { updateRoutingPolicy } from './memory/procedural'
import { consolidateMemory } from './agents/consolidationAgent'
import { recordEpisode } from './memory/episodic'
import type { CreativeBrief } from './director'

export interface RenderSegment {
  model: string
  contentType?: string
  qualityScore?: number
}

export interface RenderResult {
  segments?: RenderSegment[]
  qualityScores?: Record<string, number>
}

export async function runLearningLoop(params: {
  userId: string
  jobId: string
  result: RenderResult
  brief: CreativeBrief | null
}): Promise<void> {
  const { userId, jobId, result, brief } = params
  const scores = Object.values(result.qualityScores ?? {})
  const avgQuality = scores.length ? scores.reduce((a, b) => a + b, 0) / scores.length : 0.7

  for (const seg of result.segments ?? []) {
    await updateRoutingPolicy(seg.contentType ?? 'unknown', seg.model, seg.qualityScore ?? avgQuality, 60).catch((err) => logCaught('lib/cognition/learn', err))
  }

  await recordEpisode({
    userId,
    projectId: jobId,
    kind: 'feedback',
    summary: `Rendered: ${(brief?.direction?.concept ?? 'project').slice(0, 80)}`,
    brief,
    outcome: { qualityScores: result.qualityScores, avgQuality },
    importance: avgQuality,
  }).catch((err) => logCaught('lib/cognition/learn', err))

  if (Math.random() < 0.1) await consolidateMemory(userId).catch((err) => logCaught('lib/cognition/learn', err))
}
