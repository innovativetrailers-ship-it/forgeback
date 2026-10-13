import { buildPayload } from '@/lib/fal/videoPayloads'
import { resolveHunyuanEndpoint } from '@/lib/fal/hunyuanEndpoints'
import { falGenerateJob, falPollJob } from '@/lib/fal/modelQueue'
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

export async function generateVideo(
  input: GenerateVideoInput,
): Promise<GenerateVideoOutput> {
  const isI2V = Boolean(input.startFrameUrl)
  const model = resolveHunyuanEndpoint(isI2V)

  const falInput = await buildPayload(model, 'hunyuan-video-1.5', {
    prompt: input.prompt,
    duration: input.duration ?? 5,
    aspectRatio: input.aspectRatio ?? '16:9',
    imageUrl: input.startFrameUrl,
    negativePrompt: input.negativePrompt,
  })
  if (input.seed !== undefined) falInput.seed = input.seed

  return falGenerateJob(model, falInput)
}

export async function pollStatus(
  externalJobId: string,
  _isImageToVideo = false,
  pollUrl?: string,
): Promise<GenerateVideoOutput> {
  if (pollUrl) return falPollJob(pollUrl)
  return {
    jobId: externalJobId,
    status: 'failed',
    error: 'Missing FAL pollUrl — cannot poll Hunyuan without status_url from submit',
  }
}
