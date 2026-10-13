import { falEndpoint } from '@cinema/core/endpoints'
import { runFal, extractVideoUrl } from './client'

/**
 * Drop model-native audio from a generated clip (-c:v copy -an).
 * ElevenLabs voice/music/SFX lanes own the soundtrack.
 */
export async function stripGeneratedClipAudio(videoUrl: string): Promise<string> {
  try {
    const result = await runFal<{ video?: { url: string }; output_url?: string }>(falEndpoint('ffmpeg'), {
      video_url: videoUrl,
      command: 'strip_audio',
      output_format: 'mp4',
    })
    return extractVideoUrl(result) ?? result.output_url ?? videoUrl
  } catch (err) {
    console.warn(
      '[stripVideoAudio] strip_audio failed, using source clip:',
      err instanceof Error ? err.message : err,
    )
    return videoUrl
  }
}
