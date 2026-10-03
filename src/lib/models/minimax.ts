import { runFal, extractVideoUrl, fal, falQueueBound} from '@/lib/fal/client'
const falQueueOps = falQueueBound('lib.models.minimax')
import { buildPayload } from '@/lib/fal/videoPayloads'
import { resolveHailuoEndpoint } from '@/lib/fal/hailuoEndpoints'
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

const REGISTRY_KEY = 'minimax-2.3'

export async function generateVideo(
  input: GenerateVideoInput
): Promise<GenerateVideoOutput> {
  const isI2V = Boolean(input.startFrameUrl)
  const model = resolveHailuoEndpoint(REGISTRY_KEY, isI2V)

  const falInput = await buildPayload(model, REGISTRY_KEY, {
    prompt: input.prompt,
    duration: input.duration ?? 6,
    aspectRatio: input.aspectRatio ?? '16:9',
    imageUrl: input.startFrameUrl,
    negativePrompt: input.negativePrompt,
  })

  const data = await runFal(model, falInput)
  const videoUrl = extractVideoUrl(data)
  const jobId    = `minimax_${Date.now()}`

  return {
    jobId,
    status:  videoUrl ? 'complete' : 'failed',
    videoUrl,
    error:   videoUrl ? undefined : 'Minimax returned no video',
  }
}

export async function pollStatus(requestId: string): Promise<GenerateVideoOutput> {
  const model = resolveHailuoEndpoint(REGISTRY_KEY, false)
  try {
    const status = await falQueueOps.status(model, { requestId, logs: false }) as { status: string }
    if (status.status !== 'COMPLETED') {
      if (status.status === 'FAILED') {
        return { jobId: requestId, status: 'failed', error: 'Minimax generation failed' }
      }
      return { jobId: requestId, status: 'processing' }
    }
    const result = await falQueueOps.result(model, { requestId }) as { data: unknown }
    const videoUrl = extractVideoUrl(result.data)
    return { jobId: requestId, status: 'complete', videoUrl }
  } catch (err) {
    console.warn("[caught] src/lib/models/minimax.ts:48", err instanceof Error ? { name: err.name, message: err.message } : err)

    return { jobId: requestId, status: 'processing' }
  }
}
