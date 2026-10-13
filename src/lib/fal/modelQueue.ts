/**
 * Shared generate + poll helpers for model clients (BullMQ worker loops).
 */

import {
  parseFalSubmission,
  pollFalQueue,
  serializeFalSubmission,
  submitToFal,
} from '@/lib/fal/client'
import type { GenerateVideoOutput } from '@/lib/models/types'

export async function falGenerateJob(
  endpoint: string,
  input: Record<string, unknown>,
): Promise<GenerateVideoOutput> {
  const submission = await submitToFal(endpoint, input, 'fal:modelQueue')
  return {
    jobId: submission.requestId,
    status: 'pending',
    pollUrl: serializeFalSubmission(submission),
  }
}

export async function falPollJob(pollUrl?: string): Promise<GenerateVideoOutput> {
  if (!pollUrl) {
    return {
      jobId: '',
      status: 'failed',
      error: 'Missing FAL pollUrl — cannot poll without status_url from submit',
    }
  }

  const polled = await pollFalQueue(pollUrl)

  const submission = parseFalSubmission(pollUrl)
  const requestId = submission?.requestId ?? ''

  if (polled.status === 'COMPLETED') {
    const { extractVideoUrl } = await import('@/lib/fal/client')
    const videoUrl = extractVideoUrl(polled.data)
    return {
      jobId: requestId,
      status: 'complete',
      videoUrl,
      pollUrl,
    }
  }

  if (polled.status === 'FAILED') {
    return { jobId: requestId, status: 'failed', error: polled.error ?? 'FAL failed', pollUrl }
  }

  return { jobId: requestId, status: 'processing', pollUrl }
}
