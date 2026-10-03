import { db } from '@/lib/db'
import { sceneStatusFromClips, type SceneRollup } from '@/lib/studio/sceneStatus'

export async function rollupScene(sceneId: string): Promise<SceneRollup> {
  const clips = await db.studioClip.findMany({
    where: { sceneId },
    select: { status: true },
  })
  const status = sceneStatusFromClips(clips.map((clip) => clip.status))
  await db.studioScene.update({ where: { id: sceneId }, data: { status } })
  return status
}

/** Increment the owner's completed-clip counter once, then roll the parent scene up. */
export async function noteClipTerminal(clipId: string, becameCompleted: boolean): Promise<void> {
  const clip = await db.studioClip.findUnique({
    where: { id: clipId },
    select: { sceneId: true, scene: { select: { project: { select: { userId: true } } } } },
  })
  if (!clip) return
  if (becameCompleted) {
    await db.user.update({
      where: { id: clip.scene.project.userId },
      data: { totalGenerated: { increment: 1 } },
    })
  }
  await rollupScene(clip.sceneId)
}
