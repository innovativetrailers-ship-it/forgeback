/**
 * Draft vs production generation — swap expensive models and cap resolution in draft.
 * Non-FAL providers (Runway, Grok, Replicate) are never downgraded to cheap FAL defaults.
 */

import { ModelResolveError } from '@cinema/core'

export type GenerationMode = 'draft' | 'production'

export const DRAFT_PREVIEW_MODEL = 'ltx-2.3-fast'

const DRAFT_PREVIEW_FROM: Record<string, string> = {
  'veo-3.1': DRAFT_PREVIEW_MODEL,
  'kling-3.0': DRAFT_PREVIEW_MODEL,
  'seedance-2.0': DRAFT_PREVIEW_MODEL,
  'wan-2.7': DRAFT_PREVIEW_MODEL,
}

/** Visible sentence required before a draft preview may leave the selected model. */
export function draftPreviewLabel(selectedModelId: string): string {
  return `Draft preview — LTX-2.3-Fast; final render uses ${selectedModelId}`
}

/** Suggestion only. Dispatch applies it solely when the caller passes this label. */
export function suggestDraftPreviewModel(modelId: string): string | null {
  return DRAFT_PREVIEW_FROM[modelId] ?? null
}

export function refuseSilentModelSwap(selected: string, wouldHaveBeen: string): never {
  console.warn('[costGuard] refused silent draft swap', { selected, wouldHaveBeen })
  throw new ModelResolveError(`No model resolved for ${selected}. Refusing silent swap to ${wouldHaveBeen}.`)
}

export function applyModeToModel(modelId: string, mode: GenerationMode): string {
  const preview = suggestDraftPreviewModel(modelId)
  if (mode === 'draft' && preview) {
    console.warn('[costGuard] refused silent draft swap', { selected: modelId, wouldHaveBeen: preview })
  }
  return modelId
}

export function applyModeToResolution(
  resolution: string,
  mode: GenerationMode,
): '480p' | '720p' | '1080p' {
  if (mode === 'draft') return '480p'
  if (resolution === '480p' || resolution === '720p' || resolution === '1080p') {
    return resolution
  }
  return '720p'
}
