import { getModelKnowledge, refreshLiveCapability } from '@cinema/core'

/** Seed stays until a live OpenAPI fetch fills liveFields. One fetch per model per process. */
export async function refreshKnowOnMiss(modelId: string): Promise<void> {
  const entry = getModelKnowledge(modelId)
  if (!entry || entry.liveFetchedAt) return
  const next = await refreshLiveCapability(modelId)
  if (next?.liveFetchedAt) {
    console.log('[know_live]', { model: modelId, modes: next.liveModes, fetchedAt: next.liveFetchedAt })
  }
}

export async function refreshPoolOnMiss(pool: readonly string[]): Promise<void> {
  for (const id of pool) {
    try {
      await refreshKnowOnMiss(id)
    } catch (err) {
      console.warn('[know_live] seed kept', id, err instanceof Error ? err.message : err)
    }
  }
}
