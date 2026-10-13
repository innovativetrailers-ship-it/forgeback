import { requireUser } from '@/lib/auth/requireUser'
/**
 * Intelligence report retrieval API.
 * GET /api/intelligence/report?modelId=veo_3_1&limit=5
 * Returns latest intelligence reports for a model from the intelligence domain.
 */
import { NextRequest, NextResponse } from 'next/server'
import { intelligenceDb } from '@/lib/firewall/domain-guard'
import { ModelUpdateWatcher, MODEL_VERSIONS } from '@/lib/intelligence/update-watcher'
import { intelligenceProbesEnabled } from '@/lib/intelligence/guards'

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const modelId = searchParams.get('modelId')
  const limitStr = searchParams.get('limit') ?? '10'
  const limit = Math.min(parseInt(limitStr, 10) || 10, 50)

  if (!modelId) {
    // Return index of all models with latest report dates
    const allModels = Object.keys(MODEL_VERSIONS)
    const index = await Promise.all(
      allModels.map(async (id) => {
        const latest = await intelligenceDb.findLatestReport(id)
        return {
          modelId: id,
          version: MODEL_VERSIONS[id],
          hasReport: !!latest,
          lastReportAt: latest
            ? (latest.createdAt instanceof Date ? latest.createdAt.toISOString() : String(latest.createdAt))
            : null,
        }
      })
    )
    return NextResponse.json({ models: index })
  }

  // Return probe results for specific model
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) // last 30 days
  const results = await intelligenceDb.getProbeResultsForModel(modelId, since)
  const latestReport = await intelligenceDb.findLatestReport(modelId)

  return NextResponse.json({
    modelId,
    version: MODEL_VERSIONS[modelId] ?? 'unknown',
    probeCount: results.length,
    latestReport: latestReport
      ? { ...(latestReport.metadata as Record<string, unknown>), id: latestReport.id }
      : null,
    recentProbes: results.slice(0, limit).map(r => ({
      id: r.id,
      type: r.type,
      instruction: r.instruction,
      metadata: r.metadata,
      createdAt: r.createdAt,
    })),
  })
}

// POST — trigger update detection for a specific model
export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  const cronSecret = req.headers.get('authorization')
  const isWorker = cronSecret === `Bearer ${process.env.CRON_SECRET}`
  if (!isWorker && !userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { modelId?: string }
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/intelligence/report/route.ts:71", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const watcher = new ModelUpdateWatcher()

  if (!intelligenceProbesEnabled()) {
    const updates = await watcher.detectUpdates()
    return NextResponse.json({
      updatesDetected: updates.length,
      probesRun: false,
      reason: 'Intelligence probes disabled (ENABLE_INTELLIGENCE_PROBES not set)',
      models: updates.map((u) => u.model_id),
    })
  }

  if (body.modelId) {
    // Single model update check
    const updates = await watcher.detectUpdates()
    const relevant = updates.filter(u => u.model_id === body.modelId)
    for (const update of relevant) {
      await watcher.handleUpdate(update)
    }
    return NextResponse.json({ modelId: body.modelId, updatesDetected: relevant.length })
  }

  // Full update detection sweep
  const updates = await watcher.detectUpdates()
  for (const update of updates) {
    await watcher.handleUpdate(update)
  }
  return NextResponse.json({ updatesDetected: updates.length, models: updates.map(u => u.model_id) })
}
