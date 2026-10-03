import { runFal } from '@/lib/fal/client'
import { buildPayload } from '@/lib/fal/videoPayloads'
import { resolveHailuoEndpoint } from '@/lib/fal/hailuoEndpoints'
import type { GenerateVideoInput, GenerateVideoOutput } from './types'

/** SkyReels has no live FAL T2V — emotional/longform shots route through Hailuo 2.3 standard. */
const REGISTRY_KEY = 'skyreels-v3'

export interface SkyReelsPayload {
  prompt: string
  negativePrompt?: string
  duration: number
  aspectRatio: string
  characterRefs?: string[]
  seed?: number
  startFrameUrl?: string
}

export async function generateSkyReels(payload: SkyReelsPayload): Promise<string> {
  const isI2V = Boolean(payload.startFrameUrl)
  const model = resolveHailuoEndpoint(REGISTRY_KEY, isI2V)
  const input = await buildPayload(model, REGISTRY_KEY, {
    prompt: payload.prompt,
    duration: payload.duration,
    aspectRatio: payload.aspectRatio,
    imageUrl: payload.startFrameUrl,
    negativePrompt: payload.negativePrompt,
  })
  if (payload.seed !== undefined) input.seed = payload.seed

  const result = await runFal<{ video?: { url: string } }>(model, input)
  const url = result.video?.url
  if (!url) throw new Error('SkyReels (Hailuo fallback) returned no video URL')
  return url
}

export async function generateVideo(input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  try {
    const videoUrl = await generateSkyReels({
      prompt: input.prompt,
      negativePrompt: input.negativePrompt,
      duration: input.duration,
      aspectRatio: input.aspectRatio,
      characterRefs: input.characterRefs,
      seed: input.seed,
      startFrameUrl: input.startFrameUrl,
    })
    return { jobId: `skyreels-${Date.now()}`, status: 'complete', videoUrl }
  } catch (err) {
    console.warn("[caught] src/lib/models/skyreels.ts:49", err instanceof Error ? { name: err.name, message: err.message } : err)

    return {
      jobId: `skyreels-${Date.now()}`,
      status: 'failed',
      error: err instanceof Error ? err.message : 'SkyReels generation failed',
    }
  }
}

export async function pollStatus(externalJobId: string): Promise<GenerateVideoOutput> {
  return { jobId: externalJobId, status: 'complete' }
}
