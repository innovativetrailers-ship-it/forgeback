const SUNO_BASE = 'https://api.suno.ai/v1'

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
