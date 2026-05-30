// Veo 3.1 now routes through FAL (fal-ai/veo3) — no Vertex AI SDK needed
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

const FAL_MODEL = 'fal-ai/veo3'

export async function generateVideo(
  input: GenerateVideoInput
): Promise<GenerateVideoOutput> {
  const falInput: Record<string, unknown> = {
    prompt:       input.prompt,
    duration:     input.duration,
    aspect_ratio: input.aspectRatio ?? '16:9',
  }
  if (input.negativePrompt) falInput.negative_prompt = input.negativePrompt
  if (input.startFrameUrl)  falInput.image_url        = input.startFrameUrl
  if (input.seed !== undefined) falInput.seed          = input.seed

  const res = await fetch(`https://fal.run/${FAL_MODEL}`, {
    method:  'POST',
    headers: {
      Authorization:  `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: falInput }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Veo3 FAL error ${res.status}: ${err}`)
  }

  const data = await res.json() as {
    request_id?: string
    video?:      { url?: string }
    video_url?:  string
  }

  // FAL returns synchronous result or a request_id for polling
  const jobId    = data.request_id ?? `veo3_${Date.now()}`
  const videoUrl = data.video?.url ?? data.video_url

  return {
    jobId,
    status:   videoUrl ? 'complete' : 'pending',
    videoUrl,
    pollUrl:  videoUrl ? undefined : `https://queue.fal.run/${FAL_MODEL}/requests/${jobId}`,
  }
}

export async function pollStatus(requestId: string): Promise<GenerateVideoOutput> {
  const res = await fetch(
    `https://queue.fal.run/${FAL_MODEL}/requests/${requestId}`,
    { headers: { Authorization: `Key ${process.env.FAL_API_KEY}` } }
  )

  if (!res.ok) throw new Error(`Veo3 poll error ${res.status}`)

  const data = await res.json() as {
    status?:     string
    video?:      { url?: string }
    video_url?:  string
    error?:      string
  }

  if (data.status === 'COMPLETED' || data.video?.url || data.video_url) {
    return {
      jobId:    requestId,
      status:   'complete',
      videoUrl: data.video?.url ?? data.video_url,
    }
  }
  if (data.status === 'FAILED') {
    return { jobId: requestId, status: 'failed', error: data.error ?? 'Generation failed' }
  }

  return { jobId: requestId, status: 'processing' }
}
