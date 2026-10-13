// src/lib/orchestration/dagRouter.ts
// Delegates each shot by purpose through the model-knowledge RAG.

import { delegate, type Playbook, type QualityConstraint } from '@cinema/core'
import { calculateGenerationCost } from '@/lib/credits'
import { learnedOverlayForGate } from '@/lib/diagnostics/overlay'
import { tasteProfileFor } from '@/lib/cognition/shotRatings'
import type { StructuredShot, DAGNode } from './types'

function estimateShotCost(model: string, duration: number, shotNumber: number): number {
  return calculateGenerationCost(model, duration, shotNumber)
}

export const MAX_PLAN_ATTEMPTS = 3

export async function buildDAG(
  shots:         StructuredShot[],
  availablePool: string[],
  userId?:       string,
  options?:      {
    maxCognitive?: number
    qualityTier?: QualityConstraint
    projectId?: string
    query?: string
    playbook?: Playbook | null
    /** When the core spine already delegated, do not delegate again. */
    predelegated?: Map<string, { model: string; reason?: string; mode?: string; purpose?: string }>
  },
): Promise<DAGNode[]> {
  if (!availablePool?.length) {
    throw new Error('[dagRouter] availablePool is empty — refusing silent tier-default fallback')
  }
  console.log('[dagRouter] Council model pool:', availablePool.join(', '))
  const { refreshPoolOnMiss } = await import('@/lib/cognition/liveCapability')
  await refreshPoolOnMiss(availablePool)

  const tier: QualityConstraint = options?.qualityTier ?? 'standard'
  const learned = userId ? await learnedOverlayForGate(userId).catch((err) => {
    console.warn("[caught] src/lib/orchestration/dagRouter.ts:88", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (undefined)
  }) : undefined
  const taste = userId ? await tasteProfileFor(userId).catch((err) => {
    console.warn("[caught] src/lib/orchestration/dagRouter.ts:89", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (undefined)
  }) : undefined
  const playbook = options?.playbook !== undefined
    ? options.playbook
    : userId
      ? await (await import('@/lib/playbook')).loadActivePlaybook(userId, options?.projectId).catch((err) => {
        console.warn("[caught] src/lib/orchestration/dagRouter.ts:93", err instanceof Error ? { name: err.name, message: err.message } : err)
        return (null)
      })
      : null
  const projectHits = userId && options?.projectId
    ? await (await import('@/lib/ingest/embed')).queryProjectRAG(
      userId,
      options.projectId,
      options.query ?? shots[0]?.visualPrompt ?? 'project',
      5,
    ).catch((err) => {
      console.warn("[caught] src/lib/orchestration/dagRouter.ts:101", err instanceof Error ? { name: err.name, message: err.message } : err)
      return ([])
    })
    : []
  const nodes: DAGNode[] = []
  for (let i = 0; i < shots.length; i++) {
    const shot = shots[i]
    const prior = options?.predelegated?.get(shot.id ?? `shot-${i}`)
      ?? options?.predelegated?.get(`shot-${shot.shotIndex}`)
    let model: string
    let reason: string | undefined
    if (prior?.model) {
      model = prior.model
      reason = prior.reason
      if (prior.purpose) shot.purpose = prior.purpose as StructuredShot['purpose']
      shot.delegationReason = prior.reason
      shot.delegatedMode = prior.mode
    } else if (options?.predelegated) {
      throw new Error(`Shot ${shot.id ?? i} has no assignment from orchestrate`)
    } else try {
      const chosen = await delegate(shot, { qualityTier: tier, taste, playbook }, availablePool, learned)
      model = chosen.model
      reason = chosen.reason
      shot.purpose = chosen.purpose
      shot.delegationReason = chosen.reason
      shot.delegatedMode = chosen.mode
    } catch (err) {
      console.warn(
        `[dagRouter] shot ${i} delegate failed`,
        err instanceof Error ? err.message : String(err),
      )
      throw err
    }
    nodes.push({
      shot,
      assignedModel:  model,
      dependencies:   i > 0 ? [i - 1] : [],
      tailFrameUrl:   undefined,
      shotMemory:     projectHits.map((hit) => hit.summary).filter(Boolean).slice(0, 4),
      estimatedCost:  estimateShotCost(model, shot.duration, i + 1),
      priority:       shot.hasDialogue || shot.hasFaces ? 'critical' : 'normal',
      reason,
    })
  }
  return nodes
}

export function getTotalPlanCost(dag: DAGNode[]): number {
  return dag.reduce((sum, node) => node.estimatedCost + sum, 0)
}
