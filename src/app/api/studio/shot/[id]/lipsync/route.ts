import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { applyLipSyncToShot } from '@/lib/orchestration/lipSyncPass'
import { requireUser } from '@/lib/auth/requireUser'
import { recordConsent } from '@/lib/privacy/consent'

const schema = z.object({
  projectId: z.string(),
  mode: z.enum(['draft', 'production']).default('draft'),
  likenessConsent: z.literal(true),
  notMinor: z.literal(true),
})

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { id } = await params
  const parsed = schema.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'Likeness consent is required, and the person must not be a minor. Lip-sync was not run.' }, { status: 400 })
  }
  const body = parsed.data

  const clip = await db.studioClip.findUnique({
    where: { id },
    include: { scene: { include: { project: { select: { userId: true, id: true } } } } },
  })
  if (!clip || clip.scene.projectId !== body.projectId || clip.scene.project.userId !== userId) {
    return NextResponse.json({ error: 'Shot not found' }, { status: 404 })
  }

  await recordConsent(userId, 'likeness', 'studio.shot.lipsync')
  const videoUrl = await applyLipSyncToShot(id, body.projectId, body.mode)
  return NextResponse.json({ videoUrl })
}
