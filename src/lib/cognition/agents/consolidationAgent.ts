import { logCaught } from '@/lib/diagnostics/caught'
// Consolidation Agent — distil patterns across episodes into durable semantic
// insights (episodic → semantic memory consolidation).

import { db } from '@/lib/db'
import { callAgentLLM, parseAgentJSON } from './base'
import { embed, toVector } from '../memory/embeddings'

interface DistilledInsight {
  category: string
  insight: string
  confidence: number
}

const SYSTEM = `Find recurring patterns across a user's film projects. Distil them into durable
insights about their taste and what works. Return ONLY a JSON array of insights.`

export async function consolidateMemory(userId: string): Promise<void> {
  const episodes = await db.$queryRaw<Array<{ summary: string; outcome: unknown }>>`
    SELECT summary, outcome FROM "EpisodicMemory"
    WHERE "userId" = ${userId} AND importance > 0.5
    ORDER BY "createdAt" DESC LIMIT 30
  `
  if (episodes.length < 5) return

  let insights: DistilledInsight[] = []
  try {
    const text = await callAgentLLM({
      system: SYSTEM,
      maxTokens: 800,
      user: `Episodes:\n${episodes.map(e => `- ${e.summary} (outcome: ${JSON.stringify(e.outcome)})`).join('\n')}

Return JSON array:
[{ "category": "user_taste|craft_rule|genre_pattern", "insight": "durable generalisation", "confidence": 0.0-1.0 }]`,
    })
    insights = parseAgentJSON<DistilledInsight[]>(text, [])
  } catch (err) {
    console.warn("[caught] src/lib/cognition/agents/consolidationAgent.ts:37", err instanceof Error ? { name: err.name, message: err.message } : err)

    return
  }

  for (const ins of insights) {
    const vec = await embed(ins.insight)
    await db.$executeRaw`
      INSERT INTO "SemanticMemory" (id, "userId", category, insight, confidence, embedding, "reinforceCount", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${userId}, ${ins.category}, ${ins.insight}, ${ins.confidence},
              ${toVector(vec)}::vector, 1, now(), now())
    `.catch((err) => logCaught('lib/cognition/agents/consolidationAgent', err))
  }
}
