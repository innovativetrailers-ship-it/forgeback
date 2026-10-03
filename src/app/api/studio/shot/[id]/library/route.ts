import { NextRequest, NextResponse } from 'next/server'
import { createLibraryAsset } from '@/lib/library/folders'
import { db } from '@/lib/db'
import { objectKeyFromStored } from '@/lib/storage/r2'

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params
  const clip = await db.studioClip.findUnique({
    where: { id },
    include: { scene: { select: { id: true, sceneNumber: true, project: { select: { id: true, userId: true } } } } },
  })
  if (!clip || clip.scene.project.userId !== userId) {
    return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  }
  const storageKey = clip.storageKey?.trim() || objectKeyFromStored(clip.videoUrl) || objectKeyFromStored(clip.rawVideoUrl)
  if (!storageKey) return NextResponse.json({ error: 'This shot has no stored video' }, { status: 400 })
  const item = await createLibraryAsset({
    userId,
    projectId: clip.scene.project.id,
    kind: 'video',
    storageKey,
    label: clip.prompt.slice(0, 80),
    sceneId: clip.scene.id,
    sceneName: `Scene ${clip.scene.sceneNumber}`,
  })
  return NextResponse.json({ intent: 'placement', item })
}
