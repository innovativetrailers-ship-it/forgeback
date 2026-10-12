import { logCaught } from '@/lib/diagnostics/caught'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getOrderedClips, resolveDefaultAnchor } from '@/lib/studio/advanceChain'
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

  const result = await db.$transaction(async (tx) => {
    const claimed = await tx.studioClip.updateMany({
      where: {
        id,
        status: { in: ['COMPLETED', 'FAILED', 'MANUAL'] },
        scene: { project: { userId } },
      },
      data: {
        status: 'AWAITING_DIRECTION',
        videoUrl: null,
        lastFrame: null,
        manualVideo: false,
        generatingAt: null,
      },
    })
    if (claimed.count !== 1) return null

    const shot = await tx.studioClip.findUniqueOrThrow({
      where: { id },
      include: { scene: { select: { projectId: true } } },
    })
    const projectId = shot.scene.projectId
    const ordered = await getOrderedClips(tx, projectId)
    const card = ordered.find((s) => s.id === id)
    if (!card) return { shot, demotedShotIds: [] as string[] }

    const prev = [...ordered]
      .filter((s) => s.shotNumber < card.shotNumber && s.lastFrame)
      .sort((a, b) => b.shotNumber - a.shotNumber)[0]

    const def = resolveDefaultAnchor(shot, prev?.lastFrame ?? null)
    if (shot.anchorSource !== 'MANUAL') {
      await tx.studioClip.update({
        where: { id },
        data: { anchorFrameUrl: def.url, anchorSource: def.source },
      })
    }

    const downstream = ordered.filter((s) => s.shotNumber > card.shotNumber)
    const demotedShotIds = downstream
      .filter((s) => ['AWAITING_DIRECTION', 'PENDING', 'FAILED'].includes(s.status))
      .map((s) => s.id)

    await tx.studioClip.updateMany({
      where: {
        id: { in: demotedShotIds },
      },
      data: { status: 'PENDING' },
    })

    await tx.studioClip.updateMany({
      where: {
        scene: { projectId },
        anchorSource: 'AUTO',
        id: { in: demotedShotIds },
      },
      data: { anchorFrameUrl: null, anchorSource: 'NONE' },
    })

    return { shot, demotedShotIds: [id, ...demotedShotIds] }
  })

  if (!result) {
    return NextResponse.json(
      { error: 'Shot cannot be reset in its current state', currentStatus: existing.status },
      { status: 409 },
    )
  }

  if (existing.status === 'COMPLETED' || existing.status === 'MANUAL') {
    const { recordShotOutcome } = await import('@/lib/cognition/learnOutcomes')
    await recordShotOutcome({ userId, shotId: id, signal: 'regenerate' }).catch((err) => logCaught('app/api/studio/shot/[id]/reset/route', err))
  }

  return NextResponse.json({ ok: true, demotedShotIds: result.demotedShotIds })
}
