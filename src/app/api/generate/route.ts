import { orchestrateMultiModelGeneration } from '@/lib/routing/MediaRouter'
import { calculateSimpleCost, deductCredits } from '@/lib/credits'
import { TIER_ENGINE_MAP }                    from '@/lib/routing/engineRegistry'
import { db }                                 from '@/lib/db'
import { renderQueue }                        from '@/lib/queue'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const {
    prompt,
    duration       = 10,
    selectedModels = [],
    mode           = 'simple',
    tier           = 'standard',
    imageUrl,
  } = await req.json() as {
    prompt?:         string
    duration?:       number
    selectedModels?: string[]
    mode?:           string
    tier?:           string
    imageUrl?:       string
  }

  if (!prompt) return Response.json({ error: 'prompt required' }, { status: 400 })

  try {
    let creditCost: number
    let segments: Array<{ assignedModel: string; duration: number }>

    if (mode === 'director' && selectedModels.length > 0) {
      const plan = await orchestrateMultiModelGeneration(prompt, duration, selectedModels)
      creditCost = plan.totalCredits
      segments   = plan.segments
    } else {
      creditCost = calculateSimpleCost(tier, duration)
      segments   = [{ assignedModel: TIER_ENGINE_MAP[tier] ?? 'ltx-2.3-fast', duration }]
    }

    await deductCredits(db, userId, creditCost, `Generate: ${prompt.slice(0, 60)}`)

    const jobIds: string[] = []
    for (const seg of segments) {
      const job = await renderQueue.add('render-segment', {
        userId,
        prompt,
        model:    seg.assignedModel,
        duration: seg.duration,
        imageUrl,
      })
      jobIds.push(String(job.id))
    }

    return Response.json({ queued: true, creditCost, segments, jobIds })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err)
    if (msg.includes('Insufficient credits')) {
      return Response.json({ error: msg }, { status: 402 })
    }
    console.error('[generate]', err)
    return Response.json({ error: msg }, { status: 500 })
  }
}
