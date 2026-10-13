import type { OrchestrationResult } from '@/lib/orchestration/types'
import { MODEL_COSTS } from './engineRegistry'

export interface ClipSegment {
  startSeconds: number
  endSeconds: number
  duration: number
  contentType: string
  motion: 'static' | 'slow' | 'medium' | 'fast' | 'complex'
  hasDialogue: boolean
  hasFaces: boolean
  hasCGI: boolean
  complexity: 'simple' | 'moderate' | 'complex'
  assignedModel: string
  creditCost: number
}

export interface OrchestrationPlan {
  segments: ClipSegment[]
  totalCredits: number
  totalDuration: number
  modelBreakdown: Record<string, { duration: number; cost: number }>
}

function creditFor(model: string, durationSeconds: number): number {
  const rate = MODEL_COSTS[model]
  if (!rate) {
    console.warn('[estimate] no credit rate', { model, durationSeconds })
    return 0
  }
  return Math.ceil((rate / 5) * durationSeconds)
}

/** Price an orchestrate plan. Does not choose models. */
export function priceOrchestratePlan(plan: OrchestrationResult): OrchestrationPlan {
  let cursor = 0
  const segments: ClipSegment[] = plan.segments.map((segment) => {
    const duration = segment.duration
    const creditCost = creditFor(segment.model, duration)
    const row: ClipSegment = {
      startSeconds: cursor,
      endSeconds: cursor + duration,
      duration,
      contentType: segment.contentType,
      motion: 'medium',
      hasDialogue: false,
      hasFaces: false,
      hasCGI: false,
      complexity: 'moderate',
      assignedModel: segment.model,
      creditCost,
    }
    cursor += duration
    return row
  })
  const totalCredits = segments.reduce((sum, segment) => sum + segment.creditCost, 0)
  const modelBreakdown: Record<string, { duration: number; cost: number }> = {}
  for (const segment of segments) {
    const row = modelBreakdown[segment.assignedModel] ?? { duration: 0, cost: 0 }
    row.duration += segment.duration
    row.cost += segment.creditCost
    modelBreakdown[segment.assignedModel] = row
  }
  return {
    segments,
    totalCredits,
    totalDuration: plan.totalDuration,
    modelBreakdown,
  }
}
