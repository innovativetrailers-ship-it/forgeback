import { requireCallerSource } from '@cinema/core'
import { assertGenerationNotPaused } from '@/lib/generation/pause'

const SUNO_API = 'https://studio-api.suno.ai/api'
export const SUNO_V1_BASE = 'https://api.suno.ai/v1'

interface SunoClip {
  id: string
  status: string
  audio_url?: string
  title?: string
  stem_from_id?: string
}

async function sunoRequest<T>(
  method: string,
  path: string,
  body?: unknown
): Promise<T> {
  assertGenerationNotPaused('audio.suno')
  const res = await fetch(`${SUNO_API}${path}`, {
    method,
    headers: {
      Cookie: process.env.SUNO_COOKIE ?? '',
      'Content-Type': 'application/json',
    },
    body: body ? JSON.stringify(body) : undefined,
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Suno API error ${res.status}: ${err}`)
  }

  return res.json()
}

export async function generateMusic(params: {
  prompt: string
  durationSeconds: number
  instrumental?: boolean
  source?: string
}): Promise<{ audioUrl: string; title: string }> {
  const source = requireCallerSource(params.source ?? 'audio.music')
  assertGenerationNotPaused(source)
  interface SunoGenerateResponse {
    clips: SunoClip[]
  }

  const response = await sunoRequest<SunoGenerateResponse>(
    'POST',
    '/generate/v2/',
    {
      prompt: params.prompt,
      mv: 'chirp-v3-5',
      title: '',
      tags: params.instrumental ? 'instrumental' : '',
      make_instrumental: params.instrumental ?? false,
      generation_type: 'TEXT',
    }
  )

  const clipId = response.clips[0]?.id
  if (!clipId) throw new Error('Suno: no clip ID returned')

  // Poll for completion
  const startedAt = Date.now()
  const timeout = 5 * 60 * 1000

  while (Date.now() - startedAt < timeout) {
    await new Promise((r) => setTimeout(r, 5000))

    interface SunoFeedResponse {
      clips: SunoClip[]
    }

    const feed = await sunoRequest<SunoFeedResponse>('GET', `/feed/?ids=${clipId}`)
    const clip = feed.clips[0]

    if (clip?.status === 'complete' && clip.audio_url) {
      return { audioUrl: clip.audio_url, title: clip.title ?? 'Generated Music' }
    }

    if (clip?.status === 'error') {
      throw new Error('Suno generation failed')
    }
  }

  throw new Error('Suno generation timed out')
}
