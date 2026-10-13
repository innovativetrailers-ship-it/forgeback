import { logCaught } from '@/lib/diagnostics/caught'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import pLimit from 'p-limit'
import { db } from '@/lib/db'
import { alignSpeech, generateVoiceBuffer } from '@/lib/elevenlabs/client'
import { measureAudioMs } from '@/lib/audio/measure'
import { uploadToR2 } from '@/lib/storage/r2'
import { listShotPlan } from '@/lib/studio/shotPlan'

const limit = pLimit(4)

export async function generateVoiceLines(projectId: string, jobId?: string): Promise<void> {
  const tracks = await db.audioTrack.findMany({
    where: {
      projectId,
      type: 'DIALOGUE',
      status: { in: ['PENDING', 'FAILED'] },
      locked: false,
    },
  })

  const { shots } = await listShotPlan(projectId)
  const shotByClipId = new Map(shots.map((s) => [s.id, s]))

  await Promise.all(tracks.map((t) => limit(async () => {
    if (!t.prompt || !t.voiceId) return

    await db.audioTrack.update({
      where: { id: t.id },
      data: { status: 'GENERATING' },
    })

    try {
      const shot = t.shotPlanId ? shotByClipId.get(t.shotPlanId) : undefined
      let speed = 1.0
      let buffer = await generateVoiceBuffer(t.prompt, t.voiceId, {
        stability: 0.5,
        similarityBoost: 0.75,
        speed,
        source: 'audio.voice',
      })

      const work = mkdtempSync(join(tmpdir(), 'voice-'))
      let local = join(work, `${t.id}.mp3`)
      writeFileSync(local, buffer)
      let ms = await measureAudioMs(local)

      let durationWarning = false
      if (shot && ms > shot.duration * 1000) {
        speed = Math.min(1.2, (shot.duration * 1000) / ms)
        buffer = await generateVoiceBuffer(t.prompt, t.voiceId, {
          modelId: 'eleven_multilingual_v2',
          stability: 0.5,
          similarityBoost: 0.75,
          speed,
          source: 'audio.voice',
        })
        writeFileSync(local, buffer)
        ms = await measureAudioMs(local)
        if (ms > shot.duration * 1000) durationWarning = true
      }

      let alignmentWords: Array<{ text: string; start: number; end: number }> | undefined
      try {
        alignmentWords = await alignSpeech(buffer, t.prompt, 'audio.voice')
      } catch (alignErr) {
        console.warn('[dialogue] alignment skipped:', alignErr instanceof Error ? alignErr.message : alignErr)
      }

      const url = await uploadToR2(
        buffer,
        `audio/voice/${projectId}/${t.id}-v${t.version}.mp3`,
        'audio/mpeg',
      )

      await db.audioTrack.update({
        where: { id: t.id },
        data: {
          url,
          prevUrl: t.url,
          durationMs: ms,
          durationWarning,
          ...(alignmentWords ? { alignmentWords } : {}),
          status: 'READY',
        },
      })
    } catch (err) {
      await db.audioTrack.update({
        where: { id: t.id },
        data: { status: 'FAILED' },
      }).catch((err) => logCaught('lib/audio/dialoguePipeline', err))
      console.error(`[dialogue] track ${t.id} failed:`, err instanceof Error ? err.message : err)
    }
  })))

}
