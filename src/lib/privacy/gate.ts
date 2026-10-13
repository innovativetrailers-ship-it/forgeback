import { db } from '@/lib/db'

export type MemoryStore = 'episodic' | 'project'

export interface PrivacyPrefs {
  episodic: boolean
  project: boolean
}

const DEFAULTS: PrivacyPrefs = { episodic: true, project: true }

export async function readPrivacy(userId: string): Promise<PrivacyPrefs> {
  try {
    const rows = await db.$queryRaw<Array<{ privacy: PrivacyPrefs | null }>>`
      SELECT privacy FROM "User" WHERE id = ${userId}
    `
    const stored = rows[0]?.privacy
    if (!stored || typeof stored !== 'object') return DEFAULTS
    return {
      episodic: stored.episodic !== false,
      project: stored.project !== false,
    }
  } catch (err) {
    console.warn('[privacy] read', err instanceof Error ? err.message : err)
    return DEFAULTS
  }
}

export async function writePrivacy(userId: string, patch: Partial<PrivacyPrefs>): Promise<PrivacyPrefs> {
  const current = await readPrivacy(userId)
  const next = { ...current, ...patch }
  await db.$executeRaw`
    UPDATE "User" SET privacy = ${JSON.stringify(next)}::jsonb WHERE id = ${userId}
  `
  return next
}

export async function memoryAllows(userId: string, store: MemoryStore): Promise<boolean> {
  const prefs = await readPrivacy(userId)
  return prefs[store]
}

export async function clearEpisodic(userId: string): Promise<void> {
  await db.$executeRaw`DELETE FROM "EpisodicMemory" WHERE "userId" = ${userId}`
}
