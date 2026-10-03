import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { orchestrate } from '@/lib/orchestration'
import { nanoid } from 'nanoid'

const schema = z.object({
  prompt:          z.string().min(1),
  duration:        z.number().min(1).max(120).default(5),
  tier:            z.enum(['draft', 'standard', 'cinematic', 'film']).default('standard'),
  characterIds:    z.array(z.string()).optional(),
  locationId:      z.string().optional(),
  forceMultiEngine: z.boolean().optional(),
})

const TIER_LABEL: Record<string, string> = {
  draft: 'Draft', standard: 'Standard', cinematic: 'Cinematic', film: 'Film',
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { prompt, duration, tier, characterIds, locationId, forceMultiEngine } = parsed.data

  try {
    const clipId = nanoid(8)
    const planned = await orchestrate({
      prompt,
      totalDuration: duration,
      selectedModels: [],
      userId,
      planOnly: true,
      generationMode: tier === 'draft' ? 'draft' : 'production',
    })
    const segments = planned.segments.map((seg, index) => ({
      segmentId: `${clipId}-${index}`,
      clipId,
      shotId: seg.shotId ?? `${clipId}-${index}`,
      startSeconds: 0,
      endSeconds: seg.duration || duration,
      prompt: planned.plannedShots?.[index]?.visualPrompt || prompt,
      engineId: seg.model,
      tier: TIER_LABEL[tier] ?? 'Standard',
      requirements: [],
      characterIds,
      isHardCut: index === 0,
      estimatedCredits: Math.max(1, Math.ceil((seg.duration || duration) / 5)),
    }))
    void locationId
    void forceMultiEngine

    return NextResponse.json({
      segments,
      multiEngine: segments.length > 1,
      estimatedTotalCredits: segments.reduce((s, seg) => s + seg.estimatedCredits, 0),
    })
  } catch (err) {
    console.warn("[caught] src/app/api/generate/decompose/route.ts:47", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
