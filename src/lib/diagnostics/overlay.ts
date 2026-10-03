import { CIRCUIT_BREAK_N, SHOT_PURPOSES, type LearnedByPurpose } from '@cinema/core'
import { db } from '@/lib/db'
import { learnedOverlayFor } from '@/lib/cognition/learnOutcomes'

const ROUTE_AROUND = new Set(['content_flag', 'provider_transient', 'namespace_bad', 'unsupported_mode'])

/** Error tallies become a Layer-3 overlay. Frequent technical failure deprioritises that model. */
export async function errorCircuitOverlay(userId: string): Promise<Record<string, Partial<LearnedByPurpose>>> {
  const rows = await db.modelErrorTally.findMany({ where: { userId } })
  const overlay: Record<string, Partial<LearnedByPurpose>> = {}
  for (const row of rows) {
    if (!ROUTE_AROUND.has(row.category) || row.total < CIRCUIT_BREAK_N) continue
    const byPurpose: Partial<LearnedByPurpose> = overlay[row.model] ?? {}
    for (const purpose of SHOT_PURPOSES) {
      const prior = byPurpose[purpose]
      const total = Math.max(prior?.total ?? 0, row.total)
      byPurpose[purpose] = { worked: prior?.worked ?? 0, total, score: 0.1 }
    }
    overlay[row.model] = byPurpose
  }
  return overlay
}

function mergeOverlay(
  base: Record<string, Partial<LearnedByPurpose>>,
  extra: Record<string, Partial<LearnedByPurpose>>,
): Record<string, Partial<LearnedByPurpose>> {
  const out: Record<string, Partial<LearnedByPurpose>> = { ...base }
  for (const [model, byPurpose] of Object.entries(extra)) {
    out[model] = { ...out[model], ...byPurpose }
  }
  return out
}

export async function learnedOverlayForGate(userId: string): Promise<Record<string, Partial<LearnedByPurpose>>> {
  const learned = await learnedOverlayFor(userId)
  const errors = await errorCircuitOverlay(userId).catch((err) => {
    console.warn("[caught] src/lib/diagnostics/overlay.ts:37", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (({}))
  })
  return mergeOverlay(learned, errors)
}
