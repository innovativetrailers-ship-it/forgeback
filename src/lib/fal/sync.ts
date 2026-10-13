import { buildWhisperSttInput, falEndpoint } from '@cinema/core/endpoints'
import { runFal } from './client'

export interface LipSyncInput {
  videoUrl: string
  audioUrl?: string
  text?: string
  voiceId?: string
}

export async function lipSync(input: LipSyncInput): Promise<string> {
  interface SadTalkerResult {
    video?: { url: string }
  }

  if (!input.audioUrl && !input.text) {
    throw new Error('LipSync requires either audioUrl or text')
  }

  const result = await runFal<SadTalkerResult>(falEndpoint('sadtalker'), {
    source_image_url: input.videoUrl,
    driven_audio_url: input.audioUrl ?? '',
  })

  return result.video?.url ?? input.videoUrl
}

export async function transcribeAudio(audioUrl: string): Promise<{
  text: string
  segments: Array<{ start: number; end: number; text: string }>
}> {
  interface WhisperResult {
    text?: string
    chunks?: Array<{ timestamp: [number, number]; text: string }>
  }

  const result = await runFal<WhisperResult>(falEndpoint('whisper'), buildWhisperSttInput({
    audioUrl,
    chunkLevel: 'segment',
  }))

  return {
    text: result.text ?? '',
    segments: (result.chunks ?? []).map((c) => ({
      start: c.timestamp[0],
      end: c.timestamp[1],
      text: c.text,
    })),
  }
}
