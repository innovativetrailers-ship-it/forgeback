import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params
  const clip = await db.studioClip.findUnique({
    where: { id },
    include: { scene: { select: { project: { select: { userId: true } } } } },
  })
  if (!clip || clip.scene.project.userId !== userId) {
    return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  }
  await db.studioClip.update({
    where: { id },
    data: { orphanedAt: new Date(), statusReason: 'removed by user' },
  })
  return NextResponse.json({ id, tombstone: true })
}
