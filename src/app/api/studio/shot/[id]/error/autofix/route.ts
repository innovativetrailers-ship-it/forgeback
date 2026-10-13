import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { applyCorrectionToClip } from '@/lib/diagnostics/correct'
import { isGenerationPaused } from '@/lib/generation/pause'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await params
  const clip = await db.studioClip.findFirst({
    where: { id, scene: { project: { userId } } },
    include: { scene: { select: { projectId: true } } },
  })
  if (!clip) return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  const error = await db.shotError.findFirst({
    where: { shotId: id, correctable: true },
    orderBy: { createdAt: 'desc' },
  })
  if (!error) return NextResponse.json({ error: 'No correctable error on this shot' }, { status: 409 })
  if (isGenerationPaused()) {
    return NextResponse.json({ error: 'Generation is paused' }, { status: 503 })
  }
  await applyCorrectionToClip(id, error.correction)
  return NextResponse.json({
    ok: true,
    correction: error.correction,
    projectId: clip.scene.projectId,
    suggestedAction: error.suggestedAction,
  })
}
