// Kling now routes through FAL (fal-ai/kling-video) — no direct Kling API key needed
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

const FAL_MODEL_PRO      = 'fal-ai/kling-video/v1.6/pro/text-to-video'
const FAL_MODEL_STANDARD = 'fal-ai/kling-video/v1.6/standard/text-to-video'
const FAL_I2V_PRO        = 'fal-ai/kling-video/v1.6/pro/image-to-video'
const FAL_I2V_STANDARD   = 'fal-ai/kling-video/v1.6/standard/image-to-video'

export async function generateVideo(
  input: GenerateVideoInput,
  tier: 'standard' | 'pro' = 'standard'
): Promise<GenerateVideoOutput> {
  const isI2V      = Boolean(input.startFrameUrl)
  const falModelId = isI2V
    ? (tier === 'pro' ? FAL_I2V_PRO : FAL_I2V_STANDARD)
    : (tier === 'pro' ? FAL_MODEL_PRO : FAL_MODEL_STANDARD)

  const falInput: Record<string, unknown> = {
    prompt:       input.prompt,
    duration:     String(input.duration ?? 5),
    aspect_ratio: input.aspectRatio ?? '16:9',
  }
  if (input.negativePrompt)     falInput.negative_prompt = input.negativePrompt
  if (input.startFrameUrl)      falInput.image_url        = input.startFrameUrl
  if (input.seed !== undefined) falInput.seed             = input.seed

  const res = await fetch(`https://fal.run/${falModelId}`, {
    method:  'POST',
    headers: {
      Authorization:  `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ input: falInput }),
  })

  if (!res.ok) {
    const err = await res.text()
    throw new Error(`Kling FAL error ${res.status}: ${err}`)
  }

  const data = await res.json() as {
    request_id?: string
    video?:      { url?: string; cover_image_url?: string }
    video_url?:  string
  }

  const jobId        = data.request_id ?? `kling_${Date.now()}`
  const videoUrl     = data.video?.url ?? data.video_url
  const thumbnailUrl = data.video?.cover_image_url

  return {
    jobId,
    status:       videoUrl ? 'complete' : 'pending',
    videoUrl,
    thumbnailUrl,
    pollUrl: videoUrl ? undefined : `https://queue.fal.run/${falModelId}/requests/${jobId}`,
  }
}

export async function pollStatus(
  requestId: string,
  isImageToVideo = false
): Promise<GenerateVideoOutput> {
  const falModelId = isImageToVideo ? FAL_I2V_PRO : FAL_MODEL_PRO

  const res = await fetch(
    `https://queue.fal.run/${falModelId}/requests/${requestId}`,
    { headers: { Authorization: `Key ${process.env.FAL_API_KEY}` } }
  )

  if (!res.ok) throw new Error(`Kling poll error ${res.status}`)

  const data = await res.json() as {
    status?:    string
    video?:     { url?: string; cover_image_url?: string }
    video_url?: string
    error?:     string
  }

  if (data.status === 'COMPLETED' || data.video?.url || data.video_url) {
    return {
      jobId:        requestId,
      status:       'complete',
      videoUrl:     data.video?.url ?? data.video_url,
      thumbnailUrl: data.video?.cover_image_url,
    }
  }
  if (data.status === 'FAILED') {
    return { jobId: requestId, status: 'failed', error: data.error ?? 'Kling generation failed' }
  }

  return { jobId: requestId, status: 'processing' }
}
