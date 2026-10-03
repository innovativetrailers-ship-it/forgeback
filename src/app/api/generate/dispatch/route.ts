import { NextRequest, NextResponse } from 'next/server'
import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'
import { z } from 'zod'
import { dispatchClip } from '@/lib/routing/MediaDispatcher'
import { blendMultiEngineClip } from '@/lib/routing/SeamlessBlender'
import { checkAndDeductCredits } from '@/lib/credits'
import type { SceneSegment } from '@/lib/routing/types'

const segmentSchema = z.object({
  segmentId:          z.string(),
  clipId:             z.string(),
  startSeconds:       z.number(),
  endSeconds:         z.number(),
  prompt:             z.string(),
  engineId:           z.string(),
  tier:               z.string(),
  requirements:       z.array(z.string()),
  characterIds:       z.array(z.string()).optional(),
  anchorStartFrameUrl: z.string().optional(),
  anchorEndFrameUrl:   z.string().optional(),
  estimatedCredits:   z.number(),
})

const schema = z.object({
  segments: z.array(segmentSchema).min(1),
  blend:    z.boolean().default(true),
})

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json()
  const parsed = schema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 })
  }

  const { segments, blend } = parsed.data

  // Deduct credits for all segments
  const totalCredits = segments.reduce((s, seg) => s + seg.estimatedCredits, 0)
  try {
    const unitsOfWan = Math.max(1, Math.ceil(totalCredits / 2))
    await checkAndDeductCredits(userId, 'generate_wan', unitsOfWan)
  } catch (err) {
    console.warn("[caught] src/app/api/generate/dispatch/route.ts:46", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 402 })
  }

  try {
    const results = await dispatchClip({ segments: segments as SceneSegment[] })

    if (!blend || results.length === 1) {
      return NextResponse.json({ results, blendedUrl: results[0]?.videoUrl ?? null })
    }

    const { blendedUrl } = await blendMultiEngineClip({
      segments: results.map((r) => ({
        segmentId: r.segmentId,
        videoUrl: r.videoUrl,
        engineId: segments.find((s) => s.segmentId === r.segmentId)?.engineId ?? refuseSilentModelSwap(r.segmentId, 'wan'),
      })),
    })

    return NextResponse.json({ results, blendedUrl })
  } catch (err) {
    console.warn("[caught] src/app/api/generate/dispatch/route.ts:66", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
