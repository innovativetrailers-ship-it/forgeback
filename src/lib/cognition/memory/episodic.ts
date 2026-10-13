// Episodic memory: every creative decision + its outcome, with vector RAG and
// recency/frequency bookkeeping that feeds selective forgetting.

import { db } from '@/lib/db'
import { embed, toVector } from './embeddings'

export interface RecordEpisodeParams {
  userId: string
  projectId?: string
  kind: string
  summary: string
  intent?: unknown
  brief?: unknown
  outcome?: unknown
  importance?: number
}

export async function recordEpisode(params: RecordEpisodeParams): Promise<void> {
  const { memoryAllows } = await import('@/lib/privacy/gate')
  if (!(await memoryAllows(params.userId, 'episodic'))) return
  const vec = await embed(`${params.summary} ${JSON.stringify(params.intent ?? '')}`)
  await db.$executeRaw`
    INSERT INTO "EpisodicMemory" (id, "userId", "projectId", kind, summary, intent, brief, outcome, embedding, importance, "createdAt", "lastAccessed")
    VALUES (gen_random_uuid()::text, ${params.userId}, ${params.projectId ?? null}, ${params.kind},
            ${params.summary}, ${JSON.stringify(params.intent ?? {})}::jsonb, ${JSON.stringify(params.brief ?? {})}::jsonb,
            ${JSON.stringify(params.outcome ?? {})}::jsonb, ${toVector(vec)}::vector,
            ${params.importance ?? 0.5}, now(), now())
  `
}

export interface RecalledEpisode {
  id: string
  summary: string
  intent: unknown
  brief: unknown
  outcome: { qualityScore?: number } | null
  importance: number
  similarity: number
}

export async function recallEpisodes(userId: string, query: string, limit = 5): Promise<RecalledEpisode[]> {
  const { memoryAllows } = await import('@/lib/privacy/gate')
  if (!(await memoryAllows(userId, 'episodic'))) return []
  const vec = await embed(query)
  const literal = toVector(vec)
  const rows = await db.$queryRaw<RecalledEpisode[]>`
    SELECT id, summary, intent, brief, outcome, importance,
           1 - (embedding <=> ${literal}::vector) AS similarity
    FROM "EpisodicMemory"
    WHERE "userId" = ${userId} AND embedding IS NOT NULL
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${limit}
  `
  if (rows.length) {
    const ids = rows.map(r => r.id)
    await db.$executeRaw`
      UPDATE "EpisodicMemory" SET "accessCount" = "accessCount" + 1, "lastAccessed" = now()
      WHERE id = ANY(${ids})
    `
  }
  return rows
}
