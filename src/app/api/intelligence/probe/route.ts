/**
 * Intelligence probe trigger API.
 * Runs the probe battery against one or more models.
 * Protected: requires CRON_SECRET or admin user.
 * POST { modelId, modelVersion?, probeCategories?, tier?, mode }
 */
import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { ModelIntelligenceAnalyser } from '@/lib/intelligence/analyser'
import { PROBE_BATTERY, getProbeSets } from '@/lib/intelligence/probe-battery'
import { intelligenceProbesEnabled } from '@/lib/intelligence/guards'
import type { OutcomeTier } from '@/lib/routing/types'

function countProbes(probeSet: typeof PROBE_BATTERY): number {
  return probeSet.reduce((n, set) => n + set.probes.length, 0)
}

const VALID_MODELS = [
  'veo_3_1', 'kling_3_0', 'seedance_2_0', 'runway_gen4_5',
  'wan_2_6', 'ltx_2_3', 'minimax_hailuo', 'skyreels_v1',
  'mochi_1',
]

interface ProbeRequestBody {
  modelId: string
  modelVersion?: string
  probeCategories?: string[]    // subset of categories to run; omit for full battery
  tier?: OutcomeTier
  mode?: 'full' | 'fingerprint' | 'targeted'
}

export async function POST(req: NextRequest) {
  if (!intelligenceProbesEnabled()) {
    return NextResponse.json(
      {
        error:
          'Intelligence probes disabled. Requires RUN_MODEL_EVAL=true, ALLOW_BILLABLE_EVAL=true, ENABLE_INTELLIGENCE_PROBES=true, NODE_ENV≠production, and GENERATION_PAUSED=false.',
      },
      { status: 403 },
    )
  }

  // Full battery = 118 FAL video generations per model — CRON_SECRET or ADMIN only.
  const cronSecret = req.headers.get('authorization')
  const session = await auth()
  const userId = req.headers.get('x-user-id') ?? session?.user?.id

  const isWorker = cronSecret === `Bearer ${process.env.CRON_SECRET}`
  if (!isWorker) {
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
    }
    const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (user?.role !== 'ADMIN') {
      return NextResponse.json(
        { error: 'Intelligence probes require admin or CRON_SECRET (118 FAL calls per model)' },
        { status: 403 },
      )
    }
  }

  let body: ProbeRequestBody
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/intelligence/probe/route.ts:66", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const { modelId, modelVersion = '0.0.0', probeCategories, tier = 'Studio', mode = 'full' } = body

  if (!modelId) return NextResponse.json({ error: 'modelId is required' }, { status: 400 })
  if (!VALID_MODELS.includes(modelId)) {
    return NextResponse.json({ error: `Unknown model: ${modelId}. Valid: ${VALID_MODELS.join(', ')}` }, { status: 400 })
  }

  // Select probe set
  const probeSet = probeCategories?.length
    ? getProbeSets(probeCategories)
    : mode === 'fingerprint'
    ? getProbeSets(['efficiency', 'consistency'])
    : PROBE_BATTERY

  const analyser = new ModelIntelligenceAnalyser()

  const falCalls = countProbes(probeSet)

  try {
    console.log(
      `[Intelligence API] Starting ${mode} probe: ${modelId} v${modelVersion}, ${probeSet.length} categories, ${falCalls} FAL calls`,
    )
    const results = await analyser.probeModel({ modelId, modelVersion, probeSet, tier })
    const report = await analyser.writeAnalysisReport(modelId, results)

    return NextResponse.json({
      ok: true,
      modelId,
      modelVersion,
      probesRun: results.length,
      falCallsAttempted: falCalls,
      categories: [...new Set(results.map(r => r.category))],
      summary: {
        avgQuality: results.length > 0
          ? +(results.reduce((s, r) => s + r.assessment.quality_score, 0) / results.length).toFixed(2)
          : 0,
        highQuality: results.filter(r => r.assessment.quality_score >= 8).length,
        failures: results.filter(r => r.assessment.quality_score <= 4).length,
        optimalSceneTypes: report.optimal_scene_types,
        avoidSceneTypes: report.avoid_scene_types,
      },
    })
  } catch (err: unknown) {
    console.warn("[caught] src/app/api/intelligence/probe/route.ts:112", err instanceof Error ? { name: err.name, message: err.message } : err)

    const msg = err instanceof Error ? err.message : 'Probe run failed'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

// GET — list valid models and probe categories
export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  return NextResponse.json({
    validModels: VALID_MODELS,
    categories: PROBE_BATTERY.map(s => ({ category: s.category, probeCount: s.probes.length })),
    tiers: ['Draft', 'Studio', 'Blockbuster'],
    modes: ['full', 'fingerprint', 'targeted'],
  })
}
