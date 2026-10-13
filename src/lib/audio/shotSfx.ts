import { db } from '@/lib/db'
import { processAudioTrackJob } from '@/lib/jobs/processAudioTrackJob'

export async function shotOffsetSec(projectId: string, clipId: string): Promise<number> {
  const clip = await db.studioClip.findUnique({
    where: { id: clipId },
    select: {
      clipNumber: true,
      sceneId: true,
      scene: { select: { sceneNumber: true, projectId: true } },
    },
  })
  if (!clip || clip.scene.projectId !== projectId) return 0

  const prior = await db.studioClip.findMany({
    where: {
      OR: [
        { scene: { projectId, sceneNumber: { lt: clip.scene.sceneNumber } } },
        { sceneId: clip.sceneId, clipNumber: { lt: clip.clipNumber } },
      ],
    },
    select: { duration: true },
  })
  return prior.reduce((sum, row) => sum + row.duration, 0)
}

/** Generate pending SFX/ambience for this shot and place them at the shot offset. */
export async function renderShotSfx(projectId: string, clipId: string): Promise<number> {
  const tracks = await db.audioTrack.findMany({
    where: {
      projectId,
      shotPlanId: clipId,
      type: { in: ['SFX', 'AMBIENCE'] },
      status: { in: ['PENDING', 'FAILED'] },
      locked: false,
    },
  })
  if (tracks.length === 0) return 0

  const startSec = await shotOffsetSec(projectId, clipId)
  for (const track of tracks) {
    await db.audioTrack.update({
      where: { id: track.id },
      data: { startSec, status: 'PENDING' },
    })
    await processAudioTrackJob(track.id)
    console.log('[shot_sfx]', { clipId, trackId: track.id, type: track.type, startSec })
  }
  return tracks.length
}
