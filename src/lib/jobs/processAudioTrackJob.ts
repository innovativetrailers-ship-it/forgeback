import { logCaught } from '@/lib/diagnostics/caught'
import { writeFileSync, mkdtempSync } from 'node:fs'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { db } from '@/lib/db'
import { generateVoiceBuffer, generateSoundEffectBuffer } from '@/lib/elevenlabs/client'
import { measureAudioMs } from '@/lib/audio/measure'
import { generateMusic } from '@/lib/audio/providers'
import { uploadToR2 } from '@/lib/storage/r2'

export async function processAudioTrackJob(trackId: string): Promise<void> {
  const track = await db.audioTrack.findUnique({ where: { id: trackId } })
  if (!track) throw new Error(`AudioTrack ${trackId} not found`)

  try {
    let buffer: Buffer
    let contentType = 'audio/mpeg'

    switch (track.type) {
      case 'DIALOGUE': {
        if (!track.prompt || !track.voiceId) throw new Error('Dialogue track missing prompt or voiceId')
        buffer = await generateVoiceBuffer(track.prompt, track.voiceId, {
          modelId: 'eleven_multilingual_v2',
          source: 'audio.voice',
        })
        break
      }
      case 'MUSIC': {
        const result = await generateMusic({
          prompt: track.prompt ?? 'Cinematic film score',
          style: track.sunoStyle ?? undefined,
          lyrics: track.sunoLyrics ?? undefined,
          instrumental: track.instrumental,
          targetSeconds: 120,
          source: 'audio.music',
        })
        await db.audioTrack.update({
          where: { id: trackId },
          data: {
            url: result.url,
            prevUrl: track.url,
            provider: result.provider === 'suno' ? 'SUNO' : 'ELEVENLABS',
            status: 'READY',
            version: { increment: 1 },
          },
        })
        const local = await fetch(result.url).then((r) => r.arrayBuffer())
        const work = mkdtempSync(join(tmpdir(), 'music-'))
        const path = join(work, 'track.mp3')
        writeFileSync(path, Buffer.from(local))
        const ms = await measureAudioMs(path)
        await db.audioTrack.update({ where: { id: trackId }, data: { durationMs: ms } })
        return
      }
      case 'AMBIENCE':
      case 'SFX': {
        buffer = await generateSoundEffectBuffer(
          track.prompt ?? 'ambient soundscape',
          track.type === 'AMBIENCE' ? 22 : 8,
          0.3,
          'audio.sfx',
        )
        break
      }
      default:
        throw new Error(`Cannot generate track type ${track.type}`)
    }

    const url = await uploadToR2(
      buffer,
      `audio/${track.type.toLowerCase()}/${track.projectId}/${trackId}-v${track.version + 1}.mp3`,
      contentType,
    )

    const work = mkdtempSync(join(tmpdir(), 'audio-'))
    const local = join(work, 'track.mp3')
    writeFileSync(local, buffer)
    const durationMs = await measureAudioMs(local)

    await db.audioTrack.update({
      where: { id: trackId },
      data: {
        url,
        prevUrl: track.url,
        durationMs,
        status: 'READY',
        version: { increment: 1 },
      },
    })
  } catch (err) {
    await db.audioTrack.update({
      where: { id: trackId },
      data: { status: 'FAILED' },
    }).catch((err) => logCaught('lib/jobs/processAudioTrackJob', err))
    throw err
  }
}
