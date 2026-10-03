import { requireCallerSource } from '@cinema/core'
import { assertGenerationNotPaused } from '@/lib/generation/pause'
import { elevenLabsMusicProvider } from './elevenlabsMusic'
import { sunoProvider, SunoUnavailableError } from './suno'
import type { MusicRequest, MusicResult } from './types'

export type { MusicRequest, MusicResult, MusicProvider } from './types'

export async function generateMusic(req: MusicRequest): Promise<MusicResult> {
  requireCallerSource(req.source)
  assertGenerationNotPaused(req.source)
  if (process.env.SUNO_GATEWAY_URL) {
    try {
      return await sunoProvider.generate(req)
    } catch (e) {
      console.warn('[audio] suno_fallback_elevenlabs', {
        reason: e instanceof Error ? e.message : String(e),
      })
    }
  }
  if (process.env.SUNO_API_KEY) {
    try {
      const { generateMusicWithProgress } = await import('@/lib/engines/suno')
      const result = await generateMusicWithProgress({
        prompt: req.prompt,
        style: req.style,
        duration: req.targetSeconds,
        instrumental: req.instrumental,
      })
      const res = await fetch(result.audioUrl)
      const buf = Buffer.from(await res.arrayBuffer())
      const { uploadToR2 } = await import('@/lib/storage/r2')
      const url = await uploadToR2(buf, `audio/music/suno-${Date.now()}.mp3`, 'audio/mpeg')
      return { url, provider: 'suno' }
    } catch (e) {
      if (!(e instanceof SunoUnavailableError)) {
        console.warn('[audio] suno_legacy_fallback_elevenlabs', {
          reason: e instanceof Error ? e.message : String(e),
        })
      }
    }
  }
  return elevenLabsMusicProvider.generate(req)
}
