import { assertGenerationNotPaused } from '@/lib/generation/pause'
import type { ModelDef } from '@/lib/models/resolve'
import type { SubProgressFn } from '@/lib/orchestration/types'

const RETIRED = 'That video route was removed in April 2026 and is not in the pool. Physics routes to veo-3.1.'

export interface ReplicateVideoParams {
  prompt: string
  duration: number
  imageUrl?: string
  onSubProgress?: SubProgressFn
}

export async function replicateVideo(
  _model: ModelDef,
  _params: ReplicateVideoParams,
): Promise<string> {
  assertGenerationNotPaused('replicate:sora-2')
  throw new Error(RETIRED)
}
