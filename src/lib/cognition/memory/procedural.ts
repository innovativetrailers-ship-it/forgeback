// Procedural memory: learned model-routing policies that improve with every render.

import { db } from '@/lib/db'

// Roll model routing success rates forward from observed quality scores.
export async function updateRoutingPolicy(
  contentType: string,
  model: string,
  qualityScore: number,
  genSeconds: number,
): Promise<void> {
  const existing = await db.routingPolicy
    .findUnique({ where: { contentType_model: { contentType, model } } })
    .catch((err) => {
      console.warn("[caught] src/lib/cognition/memory/procedural.ts:14", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (null)
    })

  if (existing) {
    const n = existing.sampleCount
    const newRate = (existing.successRate * n + qualityScore) / (n + 1)
    const newTime = (existing.avgGenSeconds * n + genSeconds) / (n + 1)
    await db.routingPolicy.update({
      where: { contentType_model: { contentType, model } },
      data: { successRate: newRate, sampleCount: n + 1, avgGenSeconds: newTime, lastUpdated: new Date() },
    })
  } else {
    await db.routingPolicy.create({
      data: { contentType, model, successRate: qualityScore, sampleCount: 1, avgGenSeconds: genSeconds },
    })
  }
}

export interface LearnedPolicy {
  contentType: string
  modelId: string
  winRate: number
  sampleCount: number
}

/** Past win-rates per content type. Empty table → no personalization. */
export async function learnPolicy(_userId?: string): Promise<LearnedPolicy[]> {
  const rows = await db.routingPolicy.findMany()
  return rows.map((row) => ({
    contentType: row.contentType,
    modelId: row.model,
    winRate: row.successRate,
    sampleCount: row.sampleCount,
  }))
}

// The model that has actually performed best for a content type, once there is
// enough signal to trust it.
export async function getLearnedBestModel(contentType: string, pool: string[]): Promise<string | null> {
  const policies = await db.routingPolicy.findMany({
    where: { contentType, model: { in: pool } },
    orderBy: { successRate: 'desc' },
  })
  const trusted = policies.find(p => p.sampleCount >= 5)
  return trusted?.model ?? null
}
