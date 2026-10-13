import { type NextRequest, NextResponse } from 'next/server'
import { deductCredits, OPERATION_COSTS } from '@/lib/credits'
import { db }                             from '@/lib/db'
import { checkAccess }                    from '@/lib/access/guard'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { prompt?: string; style?: string; duration?: number; instrumental?: boolean; title?: string }
  try { body = await req.json() } catch (err) {
    console.warn("[caught] src/app/api/audio/music/route.ts:11", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }
  const { prompt, style, duration, instrumental, title } = body
  if (!prompt?.trim()) return NextResponse.json({ error: 'prompt is required' }, { status: 400 })

  const durationSecs = duration ?? 60
  const cost = Math.ceil(durationSecs / 30) * (OPERATION_COSTS['suno_music_per_30s'] ?? 5)

  const access = await checkAccess(userId, cost)
  if (!access.allowed) return NextResponse.json({ error: access.reason }, { status: access.code })

  try {
    await deductCredits(db, userId, cost, `Music: ${prompt.slice(0, 40)}`)
  } catch (err) {
    console.warn("[caught] src/app/api/audio/music/route.ts:26", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: `Insufficient credits. Music generation costs ${cost} credits.` }, { status: 402 })
  }

  const job = await db.renderJob.create({
    data: {
      userId,
      status:        'QUEUED',
      mode:          'music',
      prompt:        prompt.trim(),
      progressPct:   0,
      statusMessage: 'Queued',
      metadata:      { style, durationSecs, instrumental, title, cost },
    },
  })

  const { renderQueue } = await import('@/lib/queue')
  await renderQueue.add('music', {
    jobId: job.id, userId, prompt: prompt.trim(), style, durationSecs, instrumental, title,
  }, { attempts: 1 })

  return NextResponse.json({ jobId: job.id, queued: true, cost })
}
