import { logCaught } from '@/lib/diagnostics/caught'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(_req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params

  const existing = await db.studioClip.findFirst({
    where: { id, scene: { project: { userId } } },
    select: { status: true },
  })
  if (!existing) {
    return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  }

  const claimed = await db.studioClip.updateMany({
    where: {
      id,
      status: 'GENERATING',
      scene: { project: { userId } },
    },
    data: { status: 'FAILED', generatingAt: null, statusReason: 'The shot was marked failed. The clip was kept.' },
  })

  if (claimed.count !== 1) {
    return NextResponse.json(
      { error: 'Shot is not generating', currentStatus: existing.status },
      { status: 409 },
    )
  }

  const { recordShotOutcome } = await import('@/lib/cognition/learnOutcomes')
  await recordShotOutcome({ userId, shotId: id, signal: 'failed' }).catch((err) => logCaught('app/api/studio/shot/[id]/fail/route', err))

  return NextResponse.json({ ok: true })
}
