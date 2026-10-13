import { runFal, extractVideoUrl, fal, falQueueBound} from '@/lib/fal/client'
const falQueueOps = falQueueBound('lib.models.luma')
import { buildPayload } from '@/lib/fal/videoPayloads'
import { resolveLumaEndpoint } from '@/lib/fal/lumaEndpoints'
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

export async function generateVideo(
  input: GenerateVideoInput
): Promise<GenerateVideoOutput> {
  const isI2V = Boolean(input.startFrameUrl)
  const model = resolveLumaEndpoint(isI2V)

  const falInput = await buildPayload(model, 'luma-ray3', {
    prompt: input.prompt,
    duration: input.duration ?? 5,
    aspectRatio: input.aspectRatio ?? '16:9',
    imageUrl: input.startFrameUrl,
    negativePrompt: input.negativePrompt,
  })

  const data = await runFal(model, falInput)
  const videoUrl = extractVideoUrl(data)
  const jobId    = `luma_${Date.now()}`

  return {
    jobId,
    status:  videoUrl ? 'complete' : 'failed',
    videoUrl,
    error:   videoUrl ? undefined : 'Luma returned no video',
  }
}

export async function pollStatus(requestId: string): Promise<GenerateVideoOutput> {
  const model = resolveLumaEndpoint(false)
  try {
    const status = await falQueueOps.status(model, { requestId, logs: false }) as { status: string }
    if (status.status !== 'COMPLETED') {
      if (status.status === 'FAILED') {
        return { jobId: requestId, status: 'failed', error: 'Luma generation failed' }
      }
      return { jobId: requestId, status: 'processing' }
    }
    const result = await falQueueOps.result(model, { requestId }) as { data: unknown }
    const videoUrl = extractVideoUrl(result.data)
    return { jobId: requestId, status: 'complete', videoUrl }
  } catch (err) {
    console.warn("[caught] src/lib/models/luma.ts:46", err instanceof Error ? { name: err.name, message: err.message } : err)

    return { jobId: requestId, status: 'processing' }
  }
}
