import { assertGenerationNotPaused } from '@/lib/generation/pause'
import type { GenerateVideoInput, GenerateVideoOutput } from '@/lib/models/types'
import type { ModelDef } from '@/lib/models/resolve'
import type { SubProgressFn } from '@/lib/orchestration/types'

const RETIRED = 'Grok Imagine is hosted on FAL (xai/grok-imagine-video). The direct xAI client is retired.'

export interface GrokVideoParams {
  prompt: string
  duration: number
  imageUrl?: string
  aspectRatio?: string
  onSubProgress?: SubProgressFn
}

export async function grokVideo(
  _model: ModelDef,
  _params: GrokVideoParams,
): Promise<string> {
  assertGenerationNotPaused('xai:grok-imagine-video')
  throw new Error(RETIRED)
}

export async function generateVideo(_input: GenerateVideoInput): Promise<GenerateVideoOutput> {
  assertGenerationNotPaused('xai:generateVideo')
  throw new Error(RETIRED)
}

export async function pollStatus(externalJobId: string): Promise<GenerateVideoOutput> {
  throw new Error(`${RETIRED} Cannot confirm a video for ${externalJobId}.`)
}
