import { buildPayload } from '@/lib/fal/videoPayloads'
import { resolvePixverseEndpoint } from '@/lib/fal/pixverseEndpoints'
import { falGenerateJob, falPollJob } from '@/lib/fal/modelQueue'
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

export type PixverseRegistryKey = 'pixverse-c1' | 'pixverse-v6'

export async function generateVideo(
  input: GenerateVideoInput,
  registryKey: PixverseRegistryKey = 'pixverse-v6',
): Promise<GenerateVideoOutput> {
  const prompt = input.prompt?.trim()
  if (!prompt) throw new Error('Prompt is required for PixVerse generation')

  const isI2V = Boolean(input.startFrameUrl)
  const model = resolvePixverseEndpoint(registryKey, isI2V)

  const falInput = await buildPayload(model, registryKey, {
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
  _registryKey: PixverseRegistryKey = 'pixverse-v6',
  _isImageToVideo = false,
  pollUrl?: string,
): Promise<GenerateVideoOutput> {
  return falPollJob(pollUrl)
}
