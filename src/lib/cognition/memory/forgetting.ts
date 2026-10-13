// Selective forgetting: decay importance for cold memories, prune the coldest.

import { db } from '@/lib/db'

export async function runForgetting(): Promise<void> {
  await db.$executeRaw`
    UPDATE "EpisodicMemory"
    SET importance = GREATEST(0, importance - 0.01 * EXTRACT(DAY FROM now() - "lastAccessed") / 30)
    WHERE kind != 'feedback'
  `
  await db.$executeRaw`
    DELETE FROM "EpisodicMemory"
    WHERE importance < 0.1 AND "accessCount" < 2 AND "createdAt" < now() - interval '90 days'
  `
}
