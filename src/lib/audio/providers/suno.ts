import { assertGenerationNotPaused } from '@/lib/generation/pause'
import { uploadToR2 } from '@/lib/storage/r2'
import type { MusicProvider, MusicRequest, MusicResult } from './types'

export class SunoUnavailableError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'SunoUnavailableError'
  }
}

async function mirrorToR2(audioUrl: string, prefix: string): Promise<string> {
  const res = await fetch(audioUrl)
  if (!res.ok) throw new SunoUnavailableError(`Suno mirror fetch failed: ${res.status}`)
  const buf = Buffer.from(await res.arrayBuffer())
  return uploadToR2(buf, `${prefix}/${Date.now()}.mp3`, 'audio/mpeg')
}

async function pollSunoTask(taskId: string, timeoutMs: number): Promise<string> {
  const base = process.env.SUNO_GATEWAY_URL?.replace(/\/$/, '')
  if (!base) throw new SunoUnavailableError('SUNO_GATEWAY_URL not configured')

  const started = Date.now()
  while (Date.now() - started < timeoutMs) {
    await new Promise((r) => setTimeout(r, 5000))
    const res = await fetch(`${base}/api/v1/generate/record-info?taskId=${encodeURIComponent(taskId)}`, {
      headers: { Authorization: `Bearer ${process.env.SUNO_API_KEY ?? ''}` },
    })
    if (!res.ok) continue
    const data = await res.json() as {
      data?: { status?: string; response?: { sunoData?: Array<{ audioUrl?: string }> } }
    }
    const status = data.data?.status
    const audioUrl = data.data?.response?.sunoData?.[0]?.audioUrl
    if (status === 'SUCCESS' && audioUrl) return audioUrl
    if (status === 'FAILED') throw new SunoUnavailableError('Suno task failed')
  }
  throw new SunoUnavailableError('Suno task timed out')
}

export const sunoProvider: MusicProvider = {
  id: 'suno',
  async generate(req: MusicRequest): Promise<MusicResult> {
    assertGenerationNotPaused(req.source || 'audio.music')
    const base = process.env.SUNO_GATEWAY_URL?.replace(/\/$/, '')
    if (!base) throw new SunoUnavailableError('SUNO_GATEWAY_URL not configured')

    const submit = await fetch(`${base}/api/v1/generate`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${process.env.SUNO_API_KEY ?? ''}`,
      },
      body: JSON.stringify({
        prompt: req.lyrics ?? req.prompt,
        style: req.style ?? '',
        customMode: !!req.lyrics,
        instrumental: req.instrumental,
        model: process.env.SUNO_MODEL ?? 'V5',
      }),
    })
    if (!submit.ok) throw new SunoUnavailableError(await submit.text())

    const body = await submit.json() as { data?: { taskId?: string }; taskId?: string }
    const taskId = body.data?.taskId ?? body.taskId
    if (!taskId) throw new SunoUnavailableError('Suno returned no taskId')

    const audioUrl = await pollSunoTask(taskId, 240_000)
    return { url: await mirrorToR2(audioUrl, 'audio/music'), provider: 'suno' }
  },
}
