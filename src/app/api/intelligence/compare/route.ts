/**
 * Cross-model comparison API.
 * GET /api/intelligence/compare?category=physics_fluid
 * Returns all probe results for a given category across all models,
 * sorted by quality score — surfaces which model leads each capability.
 */
import { NextRequest, NextResponse } from 'next/server'
import { intelligenceDb, callDomainLLM } from '@/lib/firewall/domain-guard'
import { MODEL_VERSIONS } from '@/lib/intelligence/update-watcher'
import { ALL_CATEGORIES } from '@/lib/intelligence/probe-battery'
import { intelligenceProbesEnabled } from '@/lib/intelligence/guards'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(req.url)
  const category = searchParams.get('category')

  if (!category) {
    return NextResponse.json({ validCategories: ALL_CATEGORIES })
  }

  if (!ALL_CATEGORIES.includes(category)) {
    return NextResponse.json(
      { error: `Invalid category. Valid: ${ALL_CATEGORIES.join(', ')}` },
      { status: 400 }
    )
  }

  // Pull probe results from the last 30 days for all models in this category
  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const allResults = await intelligenceDb.getProbeResultsForModel('', since)

  // Filter to requested category
  const categoryResults = allResults.filter(r => {
    const meta = r.metadata as Record<string, unknown> | null
    return meta?.category === category
  })

  if (categoryResults.length === 0) {
    return NextResponse.json({
      category,
      message: 'No probe results found for this category. Run probes first.',
      leaderboard: [],
    })
  }

  // Group by model and compute average quality
  const byModel: Record<string, { scores: number[]; probeIds: string[] }> = {}
  for (const r of categoryResults) {
    const meta = r.metadata as Record<string, unknown> | null
    const modelId = (meta?.model_id as string) ?? 'unknown'
    const score = (meta?.quality_score as number) ?? 5
    const probeId = (meta?.probe_id as string) ?? ''
    if (!byModel[modelId]) byModel[modelId] = { scores: [], probeIds: [] }
    byModel[modelId].scores.push(score)
    byModel[modelId].probeIds.push(probeId)
  }

  const leaderboard = Object.entries(byModel)
    .map(([modelId, data]) => ({
      modelId,
      version: MODEL_VERSIONS[modelId] ?? 'unknown',
      avgScore: +(data.scores.reduce((a, b) => a + b, 0) / data.scores.length).toFixed(2),
      probeCount: data.scores.length,
      minScore: Math.min(...data.scores),
      maxScore: Math.max(...data.scores),
    }))
    .sort((a, b) => b.avgScore - a.avgScore)

  return NextResponse.json({
    category,
    leaderboard,
    analysedAt: new Date().toISOString(),
    leader: leaderboard[0]?.modelId ?? null,
  })
}

// POST — generate a cross-model summary narrative using cheap crew
export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { category?: string }
  try {
    body = await req.json()
  } catch (err) {
    console.warn("[caught] src/app/api/intelligence/compare/route.ts:88", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON' }, { status: 400 })
  }

  const category = body.category ?? 'all'

  if (!intelligenceProbesEnabled()) {
    return NextResponse.json(
      { error: 'Intelligence eval disabled (eval harness triple-gated off)' },
      { status: 503 },
    )
  }

  const since = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000)
  const allResults = await intelligenceDb.getProbeResultsForModel('', since)

  if (allResults.length === 0) {
    return NextResponse.json({ error: 'No probe data available. Run probe battery first.' }, { status: 422 })
  }

  // Build a condensed summary for the cheap crew writer
  const byCategory: Record<string, Record<string, number[]>> = {}
  for (const r of allResults) {
    const meta = r.metadata as Record<string, unknown> | null
    const cat = (meta?.category as string) ?? 'unknown'
    const modelId = (meta?.model_id as string) ?? 'unknown'
    const score = (meta?.quality_score as number) ?? 5
    if (!byCategory[cat]) byCategory[cat] = {}
    if (!byCategory[cat][modelId]) byCategory[cat][modelId] = []
    byCategory[cat][modelId].push(score)
  }

  const condensed: Record<string, Array<{ model: string; avg: number }>> = {}
  for (const [cat, models] of Object.entries(byCategory)) {
    condensed[cat] = Object.entries(models)
      .map(([model, scores]) => ({
        model,
        avg: +(scores.reduce((a, b) => a + b, 0) / scores.length).toFixed(2),
      }))
      .sort((a, b) => b.avg - a.avg)
  }

  const narrative = await callDomainLLM('intelligence', {
    source: 'intelligence:compare:narrative',
    billableClass: 'eval',
    systemPrompt: `You are a machine learning research analyst. Write concise, actionable cross-model comparison summaries for internal use. Focus on routing implications.`,
    userMessage: `Write a cross-model comparison summary for ${category === 'all' ? 'all categories' : `category: ${category}`}.

Data (avg quality scores per model per category):
${JSON.stringify(condensed, null, 2)}

Return JSON: { "category_leaders": {"category_name": "model_id"}, "routing_recommendations": ["string"], "summary": "paragraph" }`,
    requireJSON: true,
  })

  return NextResponse.json({ category, narrative, generatedAt: new Date().toISOString() })
}
