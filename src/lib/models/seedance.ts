import { runFal, extractVideoUrl, fal, falQueueBound} from '@/lib/fal/client'
const falQueueOps = falQueueBound('lib.models.seedance')
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

const FAL_MODEL = 'bytedance/seedance-2.0/text-to-video'

export interface SeedanceInput extends GenerateVideoInput {
  referenceImageUrls?: string[]
  referenceVideoUrl?:  string
  referenceAudioUrl?:  string
  generateAudio?:      boolean
  watermark?:          boolean
}

export async function generateVideo(
  input: SeedanceInput
): Promise<GenerateVideoOutput> {
  const falInput: Record<string, unknown> = {
    prompt:       input.prompt,
    aspect_ratio: input.aspectRatio ?? '16:9',
    duration:     input.duration,
  }
  if (input.negativePrompt)    falInput.negative_prompt = input.negativePrompt
  if (input.startFrameUrl)     falInput.image_url        = input.startFrameUrl
  if (input.seed !== undefined) falInput.seed             = input.seed

  const data = await runFal(FAL_MODEL, falInput)
  const videoUrl = extractVideoUrl(data)
  const jobId    = `seedance_${Date.now()}`

  return {
    jobId,
    status:  videoUrl ? 'complete' : 'failed',
    videoUrl,
    error:   videoUrl ? undefined : 'Seedance returned no video',
  }
}

export async function pollStatus(requestId: string): Promise<GenerateVideoOutput> {
  try {
    const status = await falQueueOps.status(FAL_MODEL, { requestId, logs: false }) as { status: string }
    if (status.status !== 'COMPLETED') {
      if (status.status === 'FAILED') {
        return { jobId: requestId, status: 'failed', error: 'Seedance generation failed' }
      }
      return { jobId: requestId, status: 'processing' }
    }
    const result = await falQueueOps.result(FAL_MODEL, { requestId }) as { data: unknown }
    const videoUrl = extractVideoUrl(result.data)
    return { jobId: requestId, status: 'complete', videoUrl }
  } catch (err) {
    console.warn("[caught] src/lib/models/seedance.ts:51", err instanceof Error ? { name: err.name, message: err.message } : err)

    return { jobId: requestId, status: 'processing' }
  }
}
