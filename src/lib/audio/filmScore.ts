import { db } from '@/lib/db'
import { processAudioTrackJob } from '@/lib/jobs/processAudioTrackJob'

export async function ensureFilmScore(
  projectId: string,
  cue?: { mood?: string; genre?: string; tempo?: string },
): Promise<void> {
  const ready = await db.audioTrack.findFirst({
    where: { projectId, type: 'MUSIC', status: 'READY', url: { not: null } },
  })
  if (ready) return

  const mood = cue?.mood?.trim() || 'cinematic'
  const genre = cue?.genre?.trim() || 'orchestral film score'
  const tempo = cue?.tempo?.trim() || 'measured'
  const prompt = `${mood}. ${genre}. Tempo: ${tempo}. Instrumental underscore, no vocals.`

  const existing = await db.audioTrack.findFirst({
    where: { projectId, type: 'MUSIC', status: { in: ['PENDING', 'FAILED'] }, locked: false },
  })
  const track = existing
    ? await db.audioTrack.update({
        where: { id: existing.id },
        data: {
          prompt,
          sunoStyle: genre,
          instrumental: true,
          duckUnderDialogue: true,
          startSec: 0,
          status: 'PENDING',
          provider: 'SUNO',
        },
      })
    : await db.audioTrack.create({
        data: {
          projectId,
          type: 'MUSIC',
          provider: 'SUNO',
          status: 'PENDING',
          prompt,
          sunoStyle: genre,
          instrumental: true,
          duckUnderDialogue: true,
          startSec: 0,
        },
      })

  await processAudioTrackJob(track.id)
}
