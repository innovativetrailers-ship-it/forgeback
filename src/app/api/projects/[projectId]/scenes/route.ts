import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId } = await params
  const project = await db.project.findFirst({
    where: { id: projectId, userId },
    select: { id: true },
  })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  const scenes = await db.studioScene.findMany({
    where: { projectId },
    include: { clips: { select: { id: true } } },
    orderBy: { sceneNumber: 'asc' },
  })

  const prevByNumber = new Map(scenes.map((s) => [s.sceneNumber, s]))

  return NextResponse.json({
    scenes: scenes.map((s) => {
      const prev = prevByNumber.get(s.sceneNumber - 1)
      return {
        id: s.id,
        sceneNumber: s.sceneNumber,
        title: s.title,
        status: s.status.toLowerCase(),
        clipCount: s.clips.length,
        hasAnchor: s.sceneNumber === 1 || Boolean(prev?.transitionFrame),
      }
    }),
  })
}
