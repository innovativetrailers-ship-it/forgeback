import { runFal, extractVideoUrl } from '@/lib/fal/client'
import { buildPayload } from '@/lib/fal/videoPayloads'
import { resolveModel } from '@/lib/models/resolve'
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

export async function generateVideo(
  input: GenerateVideoInput & { quality?: string }
): Promise<GenerateVideoOutput> {
  const def = resolveModel('veo-3.1')
  const falModel = def.falEndpoint!
  const falInput = await buildPayload(falModel, 'veo-3.1', {
    prompt: input.prompt,
    duration: input.duration,
    aspectRatio: input.aspectRatio ?? '16:9',
    imageUrl: input.startFrameUrl,
    negativePrompt: input.negativePrompt,
    quality: input.quality,
  })
  if (input.seed !== undefined) falInput.seed = input.seed

  const data = await runFal(falModel, falInput)
  const videoUrl = extractVideoUrl(data)
  const jobId    = `veo3_${Date.now()}`

  return {
    jobId,
    status:   videoUrl ? 'complete' : 'failed',
    videoUrl,
    error:    videoUrl ? undefined : 'Veo3 returned no video',
  }
}

export async function pollStatus(requestId: string, pollUrl?: string): Promise<GenerateVideoOutput> {
  if (pollUrl) {
    const { falPollJob } = await import('@/lib/fal/modelQueue')
    return falPollJob(pollUrl)
  }
  return { jobId: requestId, status: 'processing' }
}
