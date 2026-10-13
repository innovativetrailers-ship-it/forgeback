import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { renderQueue, trainingQueue, exportQueue } from '@/lib/queue'
import { denyUnlessCron } from '@/lib/cron-guard'
import { runWave2Reconcile } from '@/lib/reconcile/wave2'
import { backfillUnstoredClips } from '@/lib/storage/backfillClips'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const denied = denyUnlessCron(req)
  if (denied) return denied

  try {
    // Clean completed/failed jobs from BullMQ (keep last 100)
    await Promise.all([
      renderQueue.clean(7 * 24 * 3600 * 1000, 100, 'completed'),
      renderQueue.clean(7 * 24 * 3600 * 1000, 50, 'failed'),
      trainingQueue.clean(7 * 24 * 3600 * 1000, 50, 'completed'),
      exportQueue.clean(7 * 24 * 3600 * 1000, 50, 'completed'),
    ])

    // Finished jobs stay finished. Cancelling them would hide a real outcome.
    const count = 0

    // Clean up API usage logs older than 30 days
    const logCutoff = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
    const { count: logCount } = await db.apiUsageLog.deleteMany({
      where: { createdAt: { lt: logCutoff } },
    })

    const reconcile = await runWave2Reconcile().catch((err) => {
      console.warn('[reconcile]', err instanceof Error ? err.message : err)
      return null
    })
    const media = await backfillUnstoredClips()

    return NextResponse.json({
      ok: true,
      archived: count,
      reconcile,
      media,
      logsDeleted: logCount,
      timestamp: new Date().toISOString(),
    })
  } catch (err) {
    console.error('[cron/cleanup-jobs]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
