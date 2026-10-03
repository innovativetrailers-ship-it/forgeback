// Kling routes through fal queue API with URL-based polling.
import { buildPayload } from '@/lib/fal/videoPayloads'
import { resolveKlingEndpoint } from '@/lib/fal/klingEndpoints'
import { falGenerateJob, falPollJob } from '@/lib/fal/modelQueue'
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

function endpointFor(tier: 'standard' | 'pro', isImageToVideo: boolean): string {
  const registryKey = tier === 'pro' ? 'kling-3.0' : 'kling-standard'
  const model = resolveKlingEndpoint(registryKey, isImageToVideo)
  if (!model) throw new Error(`No Kling endpoint for ${registryKey}`)
  return model
}

export async function generateVideo(
  input: GenerateVideoInput,
  tier: 'standard' | 'pro' = 'standard',
): Promise<GenerateVideoOutput> {
  const prompt = input.prompt?.trim()
  if (!prompt) throw new Error('Prompt is required for Kling generation')

  const isI2V = Boolean(input.startFrameUrl)
  const model = endpointFor(tier, isI2V)

  const falInput = await buildPayload(model, tier === 'pro' ? 'kling-3.0' : 'kling-standard', {
    prompt,
    duration: input.duration ?? 5,
    aspectRatio: input.aspectRatio ?? '16:9',
    imageUrl: input.startFrameUrl,
    negativePrompt: input.negativePrompt,
  })
  if (input.seed !== undefined) falInput.seed = input.seed

  return falGenerateJob(model, falInput)
}

export async function pollStatus(
  _requestId: string,
  tier: 'standard' | 'pro' = 'standard',
  isImageToVideo = false,
  pollUrl?: string,
): Promise<GenerateVideoOutput> {
  return falPollJob(pollUrl)
}
