// Minimax now routes through FAL — no direct Minimax API key needed
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

const FAL_MODEL = 'fal-ai/minimax-video'

export async function generateVideo(
  input: GenerateVideoInput
): Promise<GenerateVideoOutput> {
  const falInput: Record<string, unknown> = {
    prompt: input.prompt,
  }
  if (input.negativePrompt) falInput.negative_prompt = input.negativePrompt
  if (input.startFrameUrl)  falInput.first_frame_image = input.startFrameUrl

  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method:  'POST',
    headers: { Authorization: `Key ${process.env.FAL_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ input: falInput }),
  })
  if (!res.ok) throw new Error(`Minimax FAL error ${res.status}: ${await res.text()}`)

  const data = await res.json() as { request_id?: string; video?: { url?: string }; video_url?: string }
  const jobId    = data.request_id ?? `minimax_${Date.now()}`
  const videoUrl = data.video?.url ?? data.video_url

  return {
    jobId,
    status:  videoUrl ? 'complete' : 'pending',
    videoUrl,
    pollUrl: videoUrl ? undefined : `https://queue.fal.run/${FAL_MODEL}/requests/${jobId}`,
  }
}

export async function pollStatus(requestId: string): Promise<GenerateVideoOutput> {
  const res = await fetch(
    `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}`,
    { headers: { Authorization: `Key ${process.env.FAL_API_KEY}` } }
  )
  if (!res.ok) throw new Error(`Minimax poll error ${res.status}`)

  const data = await res.json() as { status?: string; video?: { url?: string }; video_url?: string; error?: string }
  if (data.status === 'COMPLETED' || data.video?.url || data.video_url) {
    return { jobId: requestId, status: 'complete', videoUrl: data.video?.url ?? data.video_url }
  }
  if (data.status === 'FAILED') {
    return { jobId: requestId, status: 'failed', error: data.error ?? 'Minimax generation failed' }
  }
  return { jobId: requestId, status: 'processing' }
}
