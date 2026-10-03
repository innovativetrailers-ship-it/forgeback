import { runFal } from '../fal/client'
import { buildPayload } from '@/lib/fal/videoPayloads'
import { refuseSilentModelSwap } from '@/lib/orchestration/costGuard'
import { resolveLtxEndpoint, LTX_T2V_BY_REGISTRY } from '@/lib/fal/ltxEndpoints'
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

export type LtxRegistryKey = keyof typeof LTX_T2V_BY_REGISTRY

export interface LTXPayload {
  prompt: string
  negativePrompt?: string
  duration: number
  aspectRatio?: string
  seed?: number
  registryKey?: LtxRegistryKey
}

export async function generateLTX(payload: LTXPayload): Promise<string> {
  const registryKey = payload.registryKey ?? refuseSilentModelSwap('ltx', 'ltx-2.3-fast')
  const endpoint = resolveLtxEndpoint(registryKey, false)
  const input = await buildPayload(endpoint, registryKey, {
    prompt: payload.prompt,
    duration: payload.duration,
    aspectRatio: payload.aspectRatio ?? '16:9',
    negativePrompt: payload.negativePrompt,
  })
  if (payload.seed !== undefined) input.seed = payload.seed

  const result = await runFal<{ video?: { url: string }; video_url?: string }>(endpoint, input)
  const url = result.video?.url ?? result.video_url
  if (!url) throw new Error('LTX returned no video URL')
  return url
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  try {
    const videoUrl = await generateLTX({
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      duration: input.duration,
      aspectRatio: input.aspectRatio,
      seed: input.seed,
      registryKey: 'ltx-2.3',
    })
    return { jobId: `ltx-${Date.now()}`, status: 'complete', videoUrl }
  } catch (err) {
    console.warn("[caught] src/lib/models/ltx.ts:46", err instanceof Error ? { name: err.name, message: err.message } : err)

    return {
      jobId: `ltx-${Date.now()}`,
      status: 'failed',
      error: err instanceof Error ? err.message : 'LTX generation failed',
    }
  }
}

export async function pollStatus(externalJobId: string): Promise<GenerateVideoOutput> {
  return { jobId: externalJobId, status: 'complete' }
}
