import type { AnchorSource, Prisma, StudioClip } from '@/generated/prisma/client'

export interface OrderedClip extends StudioClip {
  shotNumber: number
  sceneNumber: number
}

export async function getOrderedClips(
  tx: Prisma.TransactionClient,
  projectId: string,
): Promise<OrderedClip[]> {
  const scenes = await tx.studioScene.findMany({
    where: { projectId },
    include: { clips: { orderBy: { clipNumber: 'asc' } } },
    orderBy: { sceneNumber: 'asc' },
  })

  const ordered: OrderedClip[] = []
  let shotNumber = 0
  for (const scene of scenes) {
    for (const clip of scene.clips) {
      shotNumber++
      ordered.push({ ...clip, shotNumber, sceneNumber: scene.sceneNumber })
    }
  }
  return ordered
}

export function resolveDefaultAnchor(
  clip: Pick<StudioClip, 'anchorPolicy' | 'keyframeUrl'>,
  carryFrame: string | null,
): { url: string | null; source: AnchorSource } {
  if (clip.anchorPolicy === 'keyframe' && clip.keyframeUrl) {
    return { url: clip.keyframeUrl, source: 'KEYFRAME' }
  }
  if (clip.anchorPolicy === 'none') {
    return { url: null, source: 'NONE' }
  }
  return carryFrame
    ? { url: carryFrame, source: 'AUTO' }
    : { url: null, source: 'NONE' }
}

export async function advanceChain(
  tx: Prisma.TransactionClient,
  projectId: string,
  currentClipId: string,
  freshLastFrame: string | null,
): Promise<void> {
  const ordered = await getOrderedClips(tx, projectId)
  const currentIdx = ordered.findIndex((c) => c.id === currentClipId)
  if (currentIdx < 0) return

  let carryFrame = freshLastFrame

  for (let i = currentIdx + 1; i < ordered.length; i++) {
    const shot = ordered[i]
    if (shot.status === 'MANUAL' || shot.status === 'COMPLETED') {
      carryFrame = shot.lastFrame ?? carryFrame
      continue
    }
    if (shot.status === 'GENERATING') return

    if (shot.chainFrom === currentClipId) {
      await tx.studioClip.update({
        where: { id: shot.id },
        data: {
          status: 'AWAITING_DIRECTION',
          ...(shot.anchorSource === 'MANUAL' ? {} : { anchorFrameUrl: null, anchorSource: 'NONE' }),
        },
      })
      return
    }

    const anchor = resolveDefaultAnchor(shot, carryFrame)
    const preserveManual = shot.anchorSource === 'MANUAL' && shot.anchorFrameUrl

    await tx.studioClip.update({
      where: { id: shot.id },
      data: {
        status: 'AWAITING_DIRECTION',
        ...(preserveManual
          ? {}
          : { anchorFrameUrl: anchor.url, anchorSource: anchor.source }),
      },
    })
    return
  }
}
