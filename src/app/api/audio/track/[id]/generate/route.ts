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

  const track = await db.audioTrack.findFirst({
    where: { id, project: { userId } },
  })
  if (!track) return NextResponse.json({ error: 'Track not found' }, { status: 404 })

  const claimed = await db.audioTrack.updateMany({
    where: { id, status: { in: ['PENDING', 'READY', 'FAILED'] }, locked: false },
    data: { status: 'GENERATING' },
  })
  if (claimed.count !== 1) {
    return NextResponse.json({ error: 'Track is locked or already generating' }, { status: 409 })
  }

  try {
    const { renderQueue } = await import('@/lib/queue')
    await renderQueue.add('audio-generate', { trackId: id })
  } catch {
    if (process.env.VERCEL) {
      const { processAudioTrackJob } = await import('@/lib/jobs/processAudioTrackJob')
      void processAudioTrackJob(id).catch((err) => console.error('[audio-generate] inline failed:', err))
    } else {
      await db.audioTrack.update({ where: { id }, data: { status: 'FAILED' } })
      return NextResponse.json({ error: 'Queue unavailable' }, { status: 503 })
    }
  }

  return NextResponse.json({ ok: true })
}
