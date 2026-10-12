import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { deleteFromR2, objectKeyFromStored } from '@/lib/storage/r2'
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
  const key = clip.storageKey?.trim() || objectKeyFromStored(clip.videoUrl) || objectKeyFromStored(clip.rawVideoUrl)
  if (key) {
    await deleteFromR2(key).catch((err) => {
      console.warn('[shot] storage delete failed', err instanceof Error ? err.message : err)
    })
  }
  await db.studioClip.delete({ where: { id } })
  return NextResponse.json({ id, tombstone: true })
}
