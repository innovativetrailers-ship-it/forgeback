import { logCaught } from '@/lib/diagnostics/caught'
// Relational craft rules — multi-hop creative reasoning that complements the
// vector semantic memory ("noir → low-key lighting → high-contrast grade").

import { db } from '@/lib/db'

export const SEED_RULES = [
  { subject: 'noir', relation: 'pairs_with', object: 'low_key_lighting' },
  { subject: 'low_key_lighting', relation: 'pairs_with', object: 'high_contrast_grade' },
  { subject: 'tension', relation: 'pairs_with', object: 'slow_push_in' },
  { subject: 'action', relation: 'pairs_with', object: 'rapid_cuts' },
  { subject: 'action', relation: 'pairs_with', object: 'dynamic_tracking' },
  { subject: 'wonder', relation: 'pairs_with', object: 'wide_aerial' },
  { subject: 'intimacy', relation: 'pairs_with', object: 'shallow_depth_of_field' },
  { subject: 'horror', relation: 'pairs_with', object: 'desaturated_palette' },
  { subject: 'nostalgia', relation: 'pairs_with', object: 'warm_grade' },
  { subject: 'nostalgia', relation: 'pairs_with', object: 'film_grain' },
] as const

export async function seedKnowledgeGraph(): Promise<void> {
  for (const r of SEED_RULES) {
    await db.craftRule.upsert({
      where: { subject_relation_object: { subject: r.subject, relation: r.relation, object: r.object } },
      update: {},
      create: { ...r, confidence: 0.8, source: 'seeded' },
    }).catch((err) => logCaught('lib/cognition/routing/knowledgeGraph', err))
  }
}

// Multi-hop: given a mood, traverse the graph for craft recommendations.
export async function recommendCraft(mood: string, depth = 2): Promise<string[]> {
  const visited = new Set<string>()
  const recommendations: string[] = []
  let frontier = [mood]

  for (let d = 0; d < depth; d++) {
    const rules = await db.craftRule.findMany({
      where: { subject: { in: frontier }, relation: 'pairs_with' },
      orderBy: { confidence: 'desc' },
    })
    const next: string[] = []
    for (const r of rules) {
      if (!visited.has(r.object)) {
        visited.add(r.object)
        recommendations.push(r.object)
        next.push(r.object)
      }
    }
    frontier = next
    if (!frontier.length) break
  }
  return recommendations
}

// Learn a new rule (called during consolidation when a pattern proves out).
export async function reinforceRule(subject: string, object: string): Promise<void> {
  await db.craftRule.upsert({
    where: { subject_relation_object: { subject, relation: 'pairs_with', object } },
    update: { reinforceCount: { increment: 1 }, confidence: { increment: 0.05 } },
    create: { subject, relation: 'pairs_with', object, confidence: 0.6, source: 'learned' },
  }).catch((err) => logCaught('lib/cognition/routing/knowledgeGraph', err))
}
