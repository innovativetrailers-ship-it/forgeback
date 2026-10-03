import { db } from '@/lib/db'
import { consumeRewardSignals } from '@/lib/cognition/rewardConsumer'
import { refreshPoolOnMiss } from '@/lib/cognition/liveCapability'
import { pushOneDevPrompt, runBiweeklyDebate, runMonthlyGapDebate } from './debates'

const BIWEEK = 14 * 24 * 60 * 60 * 1000
const MONTH = 30 * 24 * 60 * 60 * 1000

async function due(generatedBy: string, intervalMs: number): Promise<boolean> {
  const latest = await db.modelReport.findFirst({
    where: { generatedBy },
    orderBy: { createdAt: 'desc' },
    select: { createdAt: true },
  })
  if (!latest) return true
  return Date.now() - latest.createdAt.getTime() >= intervalMs
}

const HOSTED_POOL = ['seedance-2.0', 'kling-3.0', 'veo-3.1', 'gemini-omni', 'wan-2.7', 'grok-imagine-video', 'pixverse-v5.6', 'ltx-2.3-fast'] as const

/** Backend cadence. Paid debate calls stay inside the pause guard and the call cap. */
export async function runIntelligenceSchedule(): Promise<void> {
  const applied = await consumeRewardSignals().catch((err) => {
    console.warn('[intelligence] reward consumer', err instanceof Error ? err.message : err)
    return 0
  })
  console.log('[intelligence] rewards applied', applied)

  if (await due('biweekly-debate', BIWEEK)) {
    await runBiweeklyDebate().catch((err) => {
      console.warn('[intelligence] biweekly', err instanceof Error ? err.message : err)
    })
  }
  if (await due('monthly-gap', MONTH)) {
    await runMonthlyGapDebate().catch((err) => {
      console.warn('[intelligence] monthly', err instanceof Error ? err.message : err)
    })
  }
  await pushOneDevPrompt().catch((err) => {
    console.warn('[intelligence] pusher', err instanceof Error ? err.message : err)
  })
}
