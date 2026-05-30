// Luma Ray 3 now routes through FAL — no direct Luma API key needed
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

const FAL_MODEL = 'fal-ai/luma-dream-machine'

export async function generateVideo(
  input: GenerateVideoInput
): Promise<GenerateVideoOutput> {
  const falInput: Record<string, unknown> = {
    prompt:       input.prompt,
    aspect_ratio: input.aspectRatio ?? '16:9',
    duration:     input.duration,
  }
  if (input.startFrameUrl) {
    falInput.keyframes = { frame0: { type: 'image', url: input.startFrameUrl } }
  }
  if (input.endFrameUrl) {
    falInput.keyframes = {
      ...(falInput.keyframes as object),
      frame1: { type: 'image', url: input.endFrameUrl },
    }
  }

  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method:  'POST',
    headers: { Authorization: `Key ${process.env.FAL_API_KEY}`, 'Content-Type': 'application/json' },
    body:    JSON.stringify({ input: falInput }),
  })
  if (!res.ok) throw new Error(`Luma FAL error ${res.status}: ${await res.text()}`)

  const data = await res.json() as { request_id?: string; video?: { url?: string }; video_url?: string }
  const jobId    = data.request_id ?? `luma_${Date.now()}`
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
  if (!res.ok) throw new Error(`Luma poll error ${res.status}`)

  const data = await res.json() as { status?: string; video?: { url?: string }; video_url?: string; error?: string }
  if (data.status === 'COMPLETED' || data.video?.url || data.video_url) {
    return { jobId: requestId, status: 'complete', videoUrl: data.video?.url ?? data.video_url }
  }
  if (data.status === 'FAILED') {
    return { jobId: requestId, status: 'failed', error: data.error ?? 'Luma generation failed' }
  }
  return { jobId: requestId, status: 'processing' }
}
