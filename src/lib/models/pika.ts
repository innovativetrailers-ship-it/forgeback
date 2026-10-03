import { fal, falSubscribeBound} from '../fal/client'
const falSubscribe = falSubscribeBound('lib.models.pika')
import { buildPayload } from '@/lib/fal/videoPayloads'
import { resolvePikaEndpoint } from '@/lib/fal/pikaEndpoints'
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

export async function generateVideo(
  input: GenerateVideoInput
): Promise<GenerateVideoOutput> {
  const isI2V = Boolean(input.startFrameUrl)
  const model = resolvePikaEndpoint(isI2V)

  const falInput = await buildPayload(model, 'pika-2.5', {
    prompt: input.prompt,
    duration: input.duration ?? 5,
    aspectRatio: input.aspectRatio ?? '16:9',
    imageUrl: input.startFrameUrl,
    negativePrompt: input.negativePrompt,
    quality: input.quality,
  })
  if (input.seed !== undefined) falInput.seed = input.seed

  try {
    const result = await falSubscribe(model, {
      input: falInput,
      pollInterval: 3000,
    }) as unknown as { video: { url: string } }

    return {
      jobId: 'fal-' + Date.now(),
      status: 'complete',
      videoUrl: result.video.url,
    }
  } catch (err) {
    console.warn("[caught] src/lib/models/pika.ts:34", err instanceof Error ? { name: err.name, message: err.message } : err)

    return {
      jobId: 'fal-' + Date.now(),
      status: 'failed',
      error: err instanceof Error ? err.message : 'Pika generation failed',
    }
  }
}

export async function pollStatus(
  externalJobId: string
): Promise<GenerateVideoOutput> {
  return { jobId: externalJobId, status: 'processing' }
}
