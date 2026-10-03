import { requireCallerSource } from '@cinema/core'
import { assertGenerationNotPaused } from '@/lib/generation/pause'

import { SUNO_V1_BASE as SUNO_BASE } from '@/lib/audio/suno'

export interface SunoParams {
  prompt:        string
  style?:        string
  duration?:     number
  instrumental?: boolean
  title?:        string
}

export async function generateMusic(
  params: SunoParams
): Promise<{ audioUrl: string; jobId: string }> {
  assertGenerationNotPaused(requireCallerSource('audio.music'))
  const res = await fetch(`${SUNO_BASE}/generate`, {
    method:  'POST',
    headers: {
      Authorization:  `Bearer ${process.env.SUNO_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      prompt:       params.prompt,
      style:        params.style ?? 'cinematic',
      duration:     params.duration ?? 60,
      instrumental: params.instrumental ?? true,
      title:        params.title ?? 'Cinematic Forge Track',
      model:        'v4',
    }),
  })

  if (!res.ok) throw new Error(`Suno generation failed: ${await res.text()}`)

  const data = await res.json() as { audio_url: string; id?: string }
  return {
    audioUrl: data.audio_url,
    jobId:    data.id ?? `suno_${Date.now()}`,
  }
}

export async function generateMusicWithProgress(
  params:      SunoParams,
  onProgress?: (pct: number, message: string) => void
): Promise<{ audioUrl: string; jobId: string }> {
  assertGenerationNotPaused(requireCallerSource('audio.music'))
  const res = await fetch(`${SUNO_BASE}/generate`, {
    method:  'POST',
    headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt:       params.prompt,
      style:        params.style ?? 'cinematic',
      duration:     params.duration ?? 60,
      make_instrumental: params.instrumental ?? false,
      title:        params.title ?? 'Cinematic Forge Track',
      model:        'v4',
    }),
  })
  if (!res.ok) throw new Error(`Suno generation failed: ${await res.text()}`)
  const data   = await res.json() as { audio_url?: string; id?: string }
  const jobId  = data.id ?? `suno_${Date.now()}`

  onProgress?.(5, 'Suno composing…')

  for (let i = 0; i < 60; i++) {
    await new Promise(r => setTimeout(r, 3000))
    const status = await fetch(`${SUNO_BASE}/clips/${jobId}`, {
      headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` },
    }).then(r => r.json()) as { status: string; audio_url?: string; error?: string }

    if (status.status === 'streaming' || status.status === 'processing') {
      const pct = Math.min(90, 5 + Math.round((i / 60) * 85))
      onProgress?.(pct, 'Suno composing music…')
    } else if (status.status === 'complete') {
      onProgress?.(100, 'Music complete')
      return { audioUrl: status.audio_url!, jobId }
    } else if (status.status === 'error') {
      throw new Error(`Suno failed: ${status.error ?? 'unknown'}`)
    }
  }
  throw new Error('Suno timed out')
}

export async function getMusicStatus(jobId: string): Promise<{
  status:    'pending' | 'complete' | 'failed'
  audioUrl?: string
}> {
  const res  = await fetch(`${SUNO_BASE}/clips/${jobId}`, {
    headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY}` },
  })
  const data = await res.json() as { status: string; audio_url?: string }
  return {
    status:   data.status === 'complete' ? 'complete' : data.status === 'error' ? 'failed' : 'pending',
    audioUrl: data.audio_url,
  }
}
