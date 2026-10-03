import { falEndpoint } from '@cinema/core/endpoints'
import { runFal } from '../fal/client'
import { uploadToR2 } from '../storage/r2'
import { nanoid } from 'nanoid'

export async function generateFoley(params: {
  description: string
  durationSeconds: number
}): Promise<{ audioUrl: string }> {
  interface StableAudioResult {
    audio_file?: { url: string }
    audio?: { url: string }
  }

  const result = await runFal(falEndpoint('stable-audio'), {
      prompt: params.description,
      seconds_total: Math.min(params.durationSeconds, 120),
      seconds_start: 0,
    }) as StableAudioResult

  const audioUrl = result.audio_file?.url ?? result.audio?.url

  if (!audioUrl) throw new Error('AudioCraft returned no audio URL')

  return { audioUrl }
}

export async function generateAmbience(params: {
  sceneDescription: string
  durationSeconds: number
}): Promise<{ audioUrl: string }> {
  return generateFoley({
    description: `ambient sound: ${params.sceneDescription}, atmospheric, background audio`,
    durationSeconds: params.durationSeconds,
  })
}

export async function generateSoundEffect(
  description: string
): Promise<{ audioUrl: string }> {
  return generateFoley({
    description: `sound effect: ${description}, isolated, clean recording`,
    durationSeconds: 3,
  })
}

export async function uploadAudioFromUrl(audioUrl: string): Promise<string> {
  const res = await fetch(audioUrl)
  if (!res.ok) throw new Error(`Failed to fetch audio: ${res.status}`)
  const buffer = await res.arrayBuffer()
  const key = `audio/foley/${nanoid()}.mp3`
  return uploadToR2(Buffer.from(buffer), key, 'audio/mpeg')
}
