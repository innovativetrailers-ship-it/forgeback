import { orchestrate } from '@/lib/orchestration'
import { priceOrchestratePlan } from '@/lib/routing/estimatePlan'
import { calculateSimpleCost }             from '@/lib/credits'
import { TIER_ENGINE_MAP }                 from '@/lib/routing/engineRegistry'
import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { prompt, duration, selectedModels, mode, tier } = await req.json() as {
    prompt?:         string
    duration?:       number
    selectedModels?: string[]
    mode?:           string
    tier?:           string
  }

  if (!prompt || !duration) {
    return Response.json({ error: 'prompt and duration required' }, { status: 400 })
  }

  if (mode === 'director' && selectedModels && selectedModels.length > 0) {
    const planned = await orchestrate({
      prompt,
      totalDuration: duration,
      selectedModels,
      userId,
      planOnly: true,
      generationMode: 'draft',
    })
    return Response.json(priceOrchestratePlan(planned))
  }

  const engine = TIER_ENGINE_MAP[tier ?? 'standard'] ?? refuseSilentModelSwap(tier ?? 'missing', 'ltx-2.3-fast')
  const cost   = calculateSimpleCost(tier ?? 'standard', duration)
  return Response.json({
    totalCredits:   cost,
    totalDuration:  duration,
    segments:       [{ assignedModel: engine, duration, creditCost: cost }],
    modelBreakdown: { [engine]: { duration, cost } },
  })
}
