import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falQueueBound} from '../fal/client'
import { buildPayload } from '@/lib/fal/videoPayloads'
const falQueueOps = falQueueBound('lib.models.animatediff')
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

export async function generateVideo(
  input: GenerateVideoInput
): Promise<GenerateVideoOutput> {
  interface FalResult {
    request_id: string
  }

  const built = await buildPayload(falEndpoint('animatediff-v2v'), 'animatediff', {
    prompt: input.prompt,
    duration: input.duration,
    negativePrompt: input.negativePrompt,
    imageUrl: input.startFrameUrl,
    seed: input.seed,
    extraFields: {
      num_frames: Math.round(input.duration * 8),
      motion_bucket_id: Math.round((input.motionStrength ?? 0.5) * 127),
      fps: 8,
      ...(input.startFrameUrl ? { video_url: input.startFrameUrl } : {}),
    },
  })
  const result = await falQueueOps.submit(falEndpoint('animatediff-v2v'), { input: built }) as FalResult

  return { jobId: result.request_id, status: 'pending' }
}

export async function pollStatus(
  externalJobId: string
): Promise<GenerateVideoOutput> {
  interface FalQueueStatus {
    status: string
  }

  const status = await falQueueOps.status(falEndpoint('animatediff-v2v'), {
    requestId: externalJobId,
    logs: false,
  }) as FalQueueStatus

  if (status.status === 'COMPLETED') {
    interface FalResult {
      video?: { url: string }
    }
    const result = await falQueueOps.result(falEndpoint('animatediff-v2v'), {
      requestId: externalJobId,
    }) as FalResult

    return { jobId: externalJobId, status: 'complete', videoUrl: result.video?.url }
  }

  if (status.status === 'FAILED') {
    return { jobId: externalJobId, status: 'failed', error: 'AnimateDiff generation failed' }
  }

  return { jobId: externalJobId, status: 'processing' }
}
