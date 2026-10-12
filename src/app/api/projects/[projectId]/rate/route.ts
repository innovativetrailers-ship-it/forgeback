import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { rateFilm } from '@/lib/cognition/shotRatings'
import { requireUser } from '@/lib/auth/requireUser'

const schema = z.object({
  score: z.number().int().min(1).max(5),
  note: z.string().max(2000).optional(),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  const parsed = schema.safeParse(await req.json().catch((err) => {
    console.warn("[caught] src/app/api/projects/[projectId]/rate/route.ts:18", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (({}))
  }))
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.issues[0]?.message ?? 'Invalid rating' }, { status: 400 })
  }

  try {
    await rateFilm({
      userId,
      projectId,
      score: parsed.data.score,
      note: parsed.data.note,
    })
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.warn("[caught] src/app/api/projects/[projectId]/rate/route.ts:31", err instanceof Error ? { name: err.name, message: err.message } : err)

    const message = err instanceof Error ? err.message : 'Could not rate film'
    const status = message === 'Project not found' ? 404 : 400
    return NextResponse.json({ error: message }, { status })
  }
}
