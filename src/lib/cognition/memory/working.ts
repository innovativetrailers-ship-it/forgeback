// Working memory: short-term continuity state for the ACTIVE project — fast,
// ephemeral, Redis-backed. Reuses the shared redis singleton (TLS/build-stub aware).
// Every operation is non-fatal: if Redis is down, continuity simply falls back to
// keyframe bridging and the render proceeds.

import { redis } from '@/lib/redis'

const KEY = (jobId: string): string => `working:${jobId}`
const TTL = 60 * 60 * 6 // 6 hours — a project session

export async function setWorkingState(jobId: string, state: unknown): Promise<void> {
  try {
    await redis.set(KEY(jobId), JSON.stringify(state), 'EX', TTL)
  } catch (err) {
    console.warn('[working-memory] set failed:', err instanceof Error ? err.message : String(err))
  }
}

export async function getWorkingState<T = Record<string, unknown>>(jobId: string): Promise<T | null> {
  try {
    const v = await redis.get(KEY(jobId))
    return v ? (JSON.parse(v) as T) : null
  } catch (err) {
    console.warn("[caught] src/lib/cognition/memory/working.ts:23", err instanceof Error ? { name: err.name, message: err.message } : err)

    return null
  }
}

export async function updateWorkingState(jobId: string, patch: Record<string, unknown>): Promise<void> {
  const current = (await getWorkingState(jobId)) ?? {}
  await setWorkingState(jobId, { ...current, ...patch })
}
