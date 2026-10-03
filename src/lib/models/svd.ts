import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falQueueBound} from '../fal/client'
import { buildPayload } from '@/lib/fal/videoPayloads'
const falQueueOps = falQueueBound('lib.models.svd')
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

export async function generateVideo(
  input: GenerateVideoInput
): Promise<GenerateVideoOutput> {
  if (!input.startFrameUrl) {
    throw new Error('SVD requires a start frame image')
  }

  interface FalResult {
    request_id: string
  }

  const built = await buildPayload(falEndpoint('stable-video-diffusion'), 'svd', {
    prompt: input.prompt || 'image to video',
    duration: input.duration,
    imageUrl: input.startFrameUrl,
    seed: input.seed,
    extraFields: {
      image_url: input.startFrameUrl,
      motion_bucket_id: Math.round((input.motionStrength ?? 0.5) * 255),
      fps: 7,
    },
  })
  const result = await falQueueOps.submit(falEndpoint('stable-video-diffusion'), { input: built }) as FalResult

  return { jobId: result.request_id, status: 'pending' }
}

export async function pollStatus(
  externalJobId: string
): Promise<GenerateVideoOutput> {
  interface FalQueueStatus {
    status: string
  }

  const status = await falQueueOps.status(falEndpoint('stable-video-diffusion'), {
    requestId: externalJobId,
    logs: false,
  }) as FalQueueStatus

  if (status.status === 'COMPLETED') {
    interface FalQueueResult {
      video?: { url: string }
    }
    const result = await falQueueOps.result(falEndpoint('stable-video-diffusion'), {
      requestId: externalJobId,
    }) as FalQueueResult

    return {
      jobId: externalJobId,
      status: 'complete',
      videoUrl: result.video?.url,
    }
  }

  if (status.status === 'FAILED') {
    return { jobId: externalJobId, status: 'failed', error: 'SVD generation failed' }
  }

  return { jobId: externalJobId, status: 'processing' }
}
