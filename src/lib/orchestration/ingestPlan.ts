import {
  breakdownFromIdea,
  breakdownFromShotRows,
  detectIngestRichness,
  normalizeBreakdown,
  type ProductionBreakdown,
} from '@cinema/core'
import { isGenerationPausedError } from '@/lib/generation/pause'
import type { OrchestrationInput } from './index'
import { breakdownToShots } from './scriptBreakdown'

/** Called only from orchestrate. Not a second planner. */
export async function ingestBreakdown(input: OrchestrationInput): Promise<ProductionBreakdown> {
  const text = input.prompt.trim()
  const richness = detectIngestRichness(text)
  console.log('[ingest_richness]', richness)
  if (richness === 'plan') {
    try {
      const parsed = normalizeBreakdown(JSON.parse(text) as unknown)
      if (parsed.scenes.length) return parsed
    } catch (err) {
      console.warn('[ingest] plan JSON was not a breakdown', err instanceof Error ? err.message : err)
    }
  }
  try {
    const shots = await breakdownToShots(
      text,
      input.totalDuration,
      { characters: [], locations: [] },
      input.selectedModels,
      undefined,
      {
        premise: undefined,
        treatment: richness === 'idea'
          ? 'Expand this loose idea into scenes, then break those scenes into shots.'
          : 'Break down this screenplay. Keep its scenes. Do not replace the story.',
      },
    )
    const breakdown = breakdownFromShotRows(shots)
    if (breakdown.scenes.length) return breakdown
  } catch (err) {
    if (!isGenerationPausedError(err)) throw err
    console.warn('[ingest] expansion is paused; the idea text is the breakdown')
  }
  return breakdownFromIdea(text, input.totalDuration)
}
