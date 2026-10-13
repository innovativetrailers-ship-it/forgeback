import { submitToFal, pollFalResult, extractVideoUrl, extractImageUrl } from '@/lib/fal/client'
import { resolveVideoEndpoint } from '@/lib/orchestration/falEndpoints'
import { FAL_MODEL_IDS } from '@/lib/routing/engineRegistry'

export async function submitEngineVideo(params: {
  model: string
  prompt: string
  duration: number
  imageUrl?: string
  aspectRatio?: string
  quality?: string
}): Promise<{ videoUrl?: string; imageUrl?: string; jobId: string }> {
  if (params.model === 'grok-imagine-video') {
    const { resolveModel } = await import('@cinema/core')
    const { falVideo } = await import('@/lib/providers/falVideo')
    const def = resolveModel('grok-imagine-video')
    const videoUrl = await falVideo(def, def.canonicalId, {
      registryModel: def.canonicalId,
      prompt: params.prompt,
      duration: params.duration,
      imageUrl: params.imageUrl,
    })
    return { videoUrl, jobId: def.canonicalId }
  }

  if (params.model === 'runway-gen4') {
    const { generateVideo } = await import('@/lib/providers/runway')
    const out = await generateVideo({
      prompt: params.prompt,
      duration: params.duration,
      aspectRatio: '16:9',
      startFrameUrl: params.imageUrl,
    })
    if (out.status === 'failed') throw new Error(out.error ?? 'Runway failed')
    return { jobId: out.jobId }
  }

  const falModelId = FAL_MODEL_IDS[params.model]
    ?? resolveVideoEndpoint(params.model, Boolean(params.imageUrl))
  if (!falModelId) throw new Error(`Unknown model: ${params.model}`)

  const { buildPayload } = await import('@/lib/fal/videoPayloads')
  const input = await buildPayload(falModelId, params.model, {
    prompt: params.prompt,
    duration: params.duration,
    aspectRatio: params.aspectRatio ?? '16:9',
    imageUrl: params.imageUrl,
    quality: params.quality,
    audioPolicy: 'elevenlabs',
  })

  const submission = await submitToFal(falModelId, input, 'job.generate')
  const polled = await pollFalResult(submission)
  const result = polled.data

  return {
    videoUrl: extractVideoUrl(result) ?? extractImageUrl(result),
    imageUrl: extractImageUrl(result),
    jobId: submission.requestId,
  }
}
