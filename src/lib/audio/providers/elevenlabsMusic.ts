import { buildAudioPayload } from '@cinema/core'
import { extractAudioUrl, runFal } from '@/lib/fal/client'
import { uploadToR2 } from '@/lib/storage/r2'
import type { MusicProvider, MusicRequest, MusicResult } from './types'

export const elevenLabsMusicProvider: MusicProvider = {
  id: 'elevenlabs',
  async generate(req: MusicRequest): Promise<MusicResult> {
    const prompt = req.style
      ? `${req.prompt}. Style: ${req.style}`
      : req.prompt
    const built = buildAudioPayload('music', {
      prompt,
      forceInstrumental: req.instrumental,
      musicLengthMs: Math.round(Math.min(30, Math.max(5, req.targetSeconds)) * 1000),
    })
    const data = await runFal(built.endpoint, built.payload, undefined, 300_000, undefined, undefined, req.source)
    const audioUrl = extractAudioUrl(data)
    if (!audioUrl) throw new Error('ElevenLabs music returned no audio URL')
    const res = await fetch(audioUrl)
    if (!res.ok) throw new Error(`Failed to download ElevenLabs music (${res.status})`)
    const buffer = Buffer.from(await res.arrayBuffer())
    const url = await uploadToR2(buffer, `audio/music/el-${Date.now()}.mp3`, 'audio/mpeg')
    return { url, provider: 'elevenlabs' }
  },
}
