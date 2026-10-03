import { INGEST_EMBED_SOURCE, requireCallerSource } from '@cinema/core'
import { embed, toVector } from '@/lib/cognition/memory/embeddings'
import { db } from '@/lib/db'
import { assertGenerationNotPaused } from '@/lib/generation/pause'

export async function embedIngestText(text: string, source = INGEST_EMBED_SOURCE): Promise<number[]> {
  requireCallerSource(source)
  assertGenerationNotPaused(source)
  return embed(text.slice(0, 8000))
}

export async function recordIngestMemory(params: {
  userId: string
  projectId: string
  summary: string
  intent?: unknown
  brief?: unknown
  importance?: number
}): Promise<void> {
  const vec = await embedIngestText(`${params.summary} ${JSON.stringify(params.intent ?? '')}`)
  await db.$executeRaw`
    INSERT INTO "EpisodicMemory" (id, "userId", "projectId", kind, summary, intent, brief, outcome, embedding, importance, "createdAt", "lastAccessed")
    VALUES (gen_random_uuid()::text, ${params.userId}, ${params.projectId}, 'ingest',
            ${params.summary}, ${JSON.stringify(params.intent ?? {})}::jsonb, ${JSON.stringify(params.brief ?? {})}::jsonb,
            ${JSON.stringify({})}::jsonb, ${toVector(vec)}::vector,
            ${params.importance ?? 0.7}, now(), now())
  `
}

export async function recordProjectContextChunks(params: {
  userId: string
  projectId: string
  chunks: string[]
  sourceType: string
}): Promise<void> {
  for (const chunk of params.chunks.slice(0, 12)) {
    if (!chunk.trim()) continue
    const vec = await embedIngestText(chunk)
    await db.$executeRaw`
      INSERT INTO "SemanticMemory" (id, "userId", category, insight, evidence, confidence, embedding, "reinforceCount", "createdAt", "updatedAt")
      VALUES (gen_random_uuid()::text, ${params.userId}, 'project_context', ${chunk.slice(0, 2000)},
              ${JSON.stringify({ projectId: params.projectId, sourceType: params.sourceType })}::jsonb,
              0.7, ${toVector(vec)}::vector, 1, now(), now())
    `
  }
}

export interface ProjectRagHit {
  summary: string
  similarity: number
  kind: string
}

export async function queryProjectRAG(
  userId: string,
  projectId: string,
  query: string,
  limit = 5,
): Promise<ProjectRagHit[]> {
  const vec = await embed(query)
  const literal = toVector(vec)
  const episodic = await db.$queryRaw<ProjectRagHit[]>`
    SELECT summary, kind, 1 - (embedding <=> ${literal}::vector) AS similarity
    FROM "EpisodicMemory"
    WHERE "userId" = ${userId}
      AND "projectId" = ${projectId}
      AND kind = 'ingest'
      AND embedding IS NOT NULL
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${limit}
  `
  const semantic = await db.$queryRaw<Array<{ insight: string; similarity: number }>>`
    SELECT insight, 1 - (embedding <=> ${literal}::vector) AS similarity
    FROM "SemanticMemory"
    WHERE "userId" = ${userId}
      AND category = 'project_context'
      AND embedding IS NOT NULL
      AND evidence->>'projectId' = ${projectId}
    ORDER BY embedding <=> ${literal}::vector
    LIMIT ${limit}
  `
  return [
    ...episodic,
    ...semantic.map((row) => ({ summary: row.insight, similarity: row.similarity, kind: 'project_context' })),
  ]
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, limit)
}
