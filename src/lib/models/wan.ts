import { WAN_I2V, WAN_T2V } from '@/lib/fal/wanEndpoints'
import { buildPayload } from '@/lib/fal/videoPayloads'
import {
  extractVideoUrl,
  runFal,
  serializeFalSubmission,
  submitToFal,
} from '../fal/client'
import { falPollJob } from '@/lib/fal/modelQueue'
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

export const WAN_T2V_MODEL = WAN_T2V
export const WAN_I2V_MODEL = WAN_I2V

export async function buildWan26Input(
  input: GenerateVideoInput & { quality?: string },
): Promise<Record<string, unknown>> {
  const model = input.startFrameUrl ? WAN_I2V_MODEL : WAN_T2V_MODEL
  return buildPayload(model, 'wan-2.6', {
    prompt: input.prompt,
    duration: input.duration,
    aspectRatio: input.aspectRatio ?? '16:9',
    imageUrl: input.startFrameUrl,
    negativePrompt: input.negativePrompt,
    quality: input.quality,
    seed: input.seed,
  })
}

export async function generateVideo(
  input: GenerateVideoInput & { quality?: string },
): Promise<GenerateVideoOutput> {
  const model = input.startFrameUrl ? WAN_I2V_MODEL : WAN_T2V_MODEL
  const submission = await submitToFal(model, await buildWan26Input(input), 'model:wan')
  return {
    jobId: submission.requestId,
    status: 'pending',
    pollUrl: serializeFalSubmission(submission),
  }
}

/** Blocking generate — used by swarm barrel. */
export async function generateVideoSync(
  input: GenerateVideoInput & { quality?: string },
): Promise<string> {
  const model = input.startFrameUrl ? WAN_I2V_MODEL : WAN_T2V_MODEL
  const data = await runFal(model, await buildWan26Input(input))
  const url = extractVideoUrl(data)
  if (!url) throw new Error('Wan returned no video URL')
  return url
}

export async function pollStatus(
  externalJobId: string,
  _model?: string,
  pollUrl?: string,
): Promise<GenerateVideoOutput> {
  if (pollUrl) return falPollJob(pollUrl)
  return {
    jobId: externalJobId,
    status: 'failed',
    error: 'Missing FAL pollUrl — cannot poll Wan without status_url from submit',
  }
}
