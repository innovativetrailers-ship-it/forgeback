import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { denyUnlessCron } from '@/lib/cron-guard'
import { consumeRewardSignals } from '@/lib/cognition/rewardConsumer'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const denied = denyUnlessCron(req)
  if (denied) return denied

  try {
    const applied = await consumeRewardSignals()

    const oneWeekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000)

    // Group by selectedModel to compute win counts over the last week
    const selections = await db.rLHFLog.groupBy({
      by: ['selectedModel'],
      where: { createdAt: { gte: oneWeekAgo } },
      _count: { id: true },
      orderBy: { _count: { id: 'desc' } },
      take: 20,
    })

    // Total impressions per model: sum from modelOptions JSON arrays
    // We approximate total impressions as: each log = one selection event
    // Use a raw count of all logs in the period for normalization
    const totalLogs = await db.rLHFLog.count({ where: { createdAt: { gte: oneWeekAgo } } })

    const winRates = selections.map((s) => ({
      model: s.selectedModel,
      wins: s._count.id,
      impressions: totalLogs,
      winRate: totalLogs > 0 ? ((s._count.id / totalLogs) * 100).toFixed(1) + '%' : '0%',
    }))

    // Cache results in Redis for the model router to use
    const { redis } = await import('@/lib/redis')
    await redis.set('rlhf:win_rates', JSON.stringify(winRates), 'EX', 7 * 24 * 3600)

    return NextResponse.json({
      ok: true,
      appliedRewards: applied,
      processed: totalLogs,
      topModels: winRates.slice(0, 5),
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/process-rlhf]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
