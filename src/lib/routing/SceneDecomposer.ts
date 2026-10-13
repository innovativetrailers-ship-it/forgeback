import type { SceneSegment } from './types'

/**
 * Scene decomposition used to assign engines on its own.
 * Shot and model assignment now go through orchestrate, so this cannot diverge.
 */
export async function decomposeClip(_params: {
  masterPrompt: string
  clipId: string
  duration: number
  tier: string
  characterIds?: string[]
  locationId?: string
  forceMultiEngine?: boolean
}): Promise<SceneSegment[]> {
  throw new Error('Scene decomposition is planned by orchestrate')
}
