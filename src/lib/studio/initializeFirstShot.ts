import { db } from '@/lib/db'

/** After parse, shot 1 is immediately directable with its keyframe anchor (if any). */
export async function initializeFirstShotDirection(projectId: string): Promise<void> {
  const firstScene = await db.studioScene.findFirst({
    where: { projectId },
    orderBy: { sceneNumber: 'asc' },
    include: { clips: { orderBy: { clipNumber: 'asc' }, take: 1 } },
  })
  const first = firstScene?.clips[0]
  if (!first) return

  await db.studioClip.update({
    where: { id: first.id },
    data: {
      status: 'AWAITING_DIRECTION',
      anchorFrameUrl: first.keyframeUrl ?? null,
      anchorSource: first.keyframeUrl ? 'KEYFRAME' : 'NONE',
    },
  })
}
