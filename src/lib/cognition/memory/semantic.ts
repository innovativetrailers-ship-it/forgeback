// Semantic memory: distilled, generalised knowledge (user taste + craft rules)
// queried by vector similarity.

import { db } from '@/lib/db'
import { embed, toVector } from './embeddings'

export interface RecalledInsight {
  insight: string
  category: string
  confidence: number
}

export async function recallSemantic(userId: string, query: string, limit = 5): Promise<RecalledInsight[]> {
  const vec = await embed(query)
  return db.$queryRaw<RecalledInsight[]>`
    SELECT insight, category, confidence
    FROM "SemanticMemory"
    WHERE ("userId" = ${userId} OR "userId" IS NULL) AND embedding IS NOT NULL
    ORDER BY embedding <=> ${toVector(vec)}::vector
    LIMIT ${limit}
  `
}
