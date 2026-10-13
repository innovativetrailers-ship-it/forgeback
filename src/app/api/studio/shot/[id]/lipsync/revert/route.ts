import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { revertLipSync } from '@/lib/orchestration/lipSyncPass'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const body = await req.json() as { projectId?: string }

  const clip = await db.studioClip.findUnique({
    where: { id },
    include: { scene: { include: { project: { select: { userId: true, id: true } } } } },
  })
  if (!clip || (body.projectId && clip.scene.projectId !== body.projectId) || clip.scene.project.userId !== userId) {
    return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  }

  const videoUrl = await revertLipSync(id)
  return NextResponse.json({ videoUrl })
}
