import { requireUser } from '@/lib/auth/requireUser'
/**
 * Intelligence pipeline status API.
 * GET /api/intelligence/status
 * Returns queue depths, last run times, model coverage summary.
 * Used by the admin dashboard to monitor the intelligence pipeline.
 */
import { NextRequest, NextResponse } from 'next/server'
import { getIntelligenceQueueLength, intelligenceDb } from '@/lib/firewall/domain-guard'
import { MODEL_VERSIONS } from '@/lib/intelligence/update-watcher'
import { ALL_CATEGORIES } from '@/lib/intelligence/probe-battery'

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const [
    probeSignalsDepth,
    updateSignalsDepth,
    routingReviewDepth,
    trainingSignalCount,
  ] = await Promise.all([
    getIntelligenceQueueLength('training:probe_signals'),
    getIntelligenceQueueLength('training:model_update_signals'),
    getIntelligenceQueueLength('routing:review_queue'),
    intelligenceDb.getTrainingSignalCount(),
  ])

  // Coverage: how many models have reports from the last 7 days
  const allModels = Object.keys(MODEL_VERSIONS)
  const coverageChecks = await Promise.all(
    allModels.map(async (modelId) => {
      const report = await intelligenceDb.findLatestReport(modelId)
      return {
        modelId,
        version: MODEL_VERSIONS[modelId],
        covered: !!report,
        lastReportAt: report?.createdAt ?? null,
      }
    })
  )

  const coveredCount = coverageChecks.filter(c => c.covered).length

  return NextResponse.json({
    queues: {
      probeSignals: probeSignalsDepth,
      modelUpdateSignals: updateSignalsDepth,
      routingReview: routingReviewDepth,
      trainingSignalTotal: trainingSignalCount,
      trainingThreshold: 1000,
      trainingThresholdReached: trainingSignalCount >= 1000,
    },
    coverage: {
      totalModels: allModels.length,
      coveredModels: coveredCount,
      coveragePercent: Math.round((coveredCount / allModels.length) * 100),
      models: coverageChecks,
    },
    categories: ALL_CATEGORIES,
    firewall: {
      domains: ['marketing', 'product', 'technical', 'intelligence'],
      domainIsolation: 'active',
      separateApiKeys: {
        marketing: !!process.env.MARKETING_AI_KEY,
        product: !!process.env.PRODUCT_AI_KEY,
        technical: !!process.env.TECHNICAL_AI_KEY,
        intelligence: !!process.env.INTELLIGENCE_AI_KEY,
      },
    },
  })
}
