/**
 * Intelligence pipeline cron trigger.
 * Called by Vercel cron or an external scheduler.
 * Authorization: Bearer ${CRON_SECRET}
 *
 * Vercel cron config in vercel.json:
 * { "crons": [{ "path": "/api/cron/intelligence", "schedule": "0 * /6 * * *" }] }
 */
import { NextRequest, NextResponse } from 'next/server'
import { ModelUpdateWatcher, generateCrossModelComparisonReport, suggestRoutingMatrixUpdates } from '@/lib/intelligence/update-watcher'
import { intelligenceProbesEnabled } from '@/lib/intelligence/guards'
import { getIntelligenceQueueLength, pushIntelligenceSignal } from '@/lib/firewall/domain-guard'
import { denyUnlessCron } from '@/lib/cron-guard'

type CronMode = 'update_detection' | 'weekly_probes' | 'monthly_comparison' | 'queue_check' | 'all'

export async function GET(req: NextRequest) {
  if (!intelligenceProbesEnabled()) {
    return NextResponse.json(
      {
        error:
          'Intelligence cron disabled. Requires RUN_MODEL_EVAL=true, ALLOW_BILLABLE_EVAL=true, ENABLE_INTELLIGENCE_PROBES=true, NODE_ENV≠production, and GENERATION_PAUSED=false.',
      },
      { status: 403 },
    )
  }

  const denied = denyUnlessCron(req)
  if (denied) return denied

  const { searchParams } = new URL(req.url)
  const mode = (searchParams.get('mode') ?? 'update_detection') as CronMode

  const log: string[] = []

  try {
    if (mode === 'update_detection' || mode === 'all') {
      log.push('Running model update detection...')
      const watcher = new ModelUpdateWatcher()
      const updates = await watcher.detectUpdates()
      log.push(`Detected ${updates.length} model update(s)`)

      for (const update of updates) {
        if (intelligenceProbesEnabled()) {
          await watcher.handleUpdate(update)
          log.push(`Handled update: ${update.model_id} ${update.previous_version} → ${update.new_version}`)
        } else {
          log.push(
            `Detected update (probes skipped): ${update.model_id} ${update.previous_version} → ${update.new_version}`,
          )
        }
      }
    }

    if (mode === 'monthly_comparison' || mode === 'all') {
      log.push('Running cross-model comparison...')
      await generateCrossModelComparisonReport()
      await suggestRoutingMatrixUpdates()
      log.push('Cross-model comparison complete')
    }

    if (mode === 'queue_check' || mode === 'all') {
      const depth = await getIntelligenceQueueLength('training:probe_signals')
      log.push(`Training queue depth: ${depth}`)

      if (depth >= 1000) {
        await pushIntelligenceSignal('training:trigger', {
          triggered_at: new Date().toISOString(),
          reason: 'cron_queue_threshold_1000',
          queue_depth: depth,
        })
        log.push(`Training run triggered (depth=${depth})`)
      }
    }

    return NextResponse.json({
      ok: true,
      mode,
      executedAt: new Date().toISOString(),
      log,
    })
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/cron/intelligence/route.ts:82", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'Intelligence cron failed'
    return NextResponse.json({ error: msg, log }, { status: 500 })
  }
}

// Also accept POST for manual admin triggers
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  const auth = req.headers.get('authorization')
  const isWorker = auth === `Bearer ${process.env.CRON_SECRET}`
  if (!isWorker && !userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { mode?: CronMode }
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/cron/intelligence/route.ts:100", err instanceof Error ? { name: err.name, message: err.message } : err)

    body = {}
  }

  // Delegate to GET handler with mode from body
  const url = new URL(req.url)
  url.searchParams.set('mode', body.mode ?? 'update_detection')

  const modifiedReq = new NextRequest(url, {
    headers: { authorization: `Bearer ${process.env.CRON_SECRET}` },
  })
  return GET(modifiedReq)
}
