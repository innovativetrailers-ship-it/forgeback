import { type NextRequest, NextResponse } from 'next/server'
import { BEHAVIOUR_SIGNAL } from '@cinema/core'
import { recordShotOutcome } from '@/lib/cognition/learnOutcomes'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let body: { jobId?: string; shotId?: string; signal?: string; reason?: string; source?: string }
  try {
    body = (await req.json()) as typeof body
  } catch (err) {
    console.warn("[caught] src/app/api/feedback/signal/route.ts:12", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { jobId, shotId, signal, reason } = body
  if (!signal || !(signal in BEHAVIOUR_SIGNAL)) {
    return NextResponse.json(
      { error: `Unknown signal. Valid: ${Object.keys(BEHAVIOUR_SIGNAL).join(', ')}` },
      { status: 400 },
    )
  }

  await recordShotOutcome({
    userId,
    jobId,
    shotId,
    signal,
    reason,
    source: body.source === 'rating' ? 'rating' : 'behaviour',
  })

  return NextResponse.json({ recorded: true })
}
