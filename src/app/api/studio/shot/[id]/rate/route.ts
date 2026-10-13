import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { failReasonsFor, isShotPurpose, ratingPromptFor } from '@cinema/core'
import { rateShot } from '@/lib/cognition/shotRatings'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  thumbs: z.enum(['up', 'down']).optional(),
  score: z.number().int().min(1).max(5).optional(),
  reason: z.string().optional(),
  dimension: z.string().optional(),
  note: z.string().max(2000).optional(),
}).refine((body) => Boolean(body.thumbs || body.score), {
  message: 'Rate with thumbs or a 1–5 score',
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = schema.safeParse(await req.json().catch((err) => {
    console.warn("[caught] src/app/api/studio/shot/[id]/rate/route.ts:24", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (({}))
  }))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid rating' }, { status: 400 })
  }

  try {
    const rated = await rateShot({
      userId,
      shotId: id,
      thumbs: parsed.data.thumbs,
      score: parsed.data.score,
      reason: parsed.data.reason,
      dimension: parsed.data.dimension,
      note: parsed.data.note,
    })
    const purpose = isShotPurpose(rated.purpose) ? rated.purpose : 'hero'
    return NextResponse.json({
      ok: true,
      ...rated,
      ratingPrompt: ratingPromptFor(purpose),
      failReasons: failReasonsFor(purpose),
    })
  } catch (err) {
    console.warn("[caught] src/app/api/studio/shot/[id]/rate/route.ts:46", err instanceof Error ? { name: err.name, message: err.message } : err)

    const message = err instanceof Error ? err.message : 'Could not rate shot'
    const status = message === 'Shot not found' ? 404 : message === 'Rate a finished shot' ? 409 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
