import type { ClipColourGrade } from '@/lib/timeline/schema'

export type ColourMood = 'warm' | 'cool' | 'cinematic' | 'vintage' | 'moody'

export interface ColourGradeSuggestion {
  shadows: number
  midtones: number
  highlights: number
  temperature: number
  tint: number
  saturation: number
  lutSuggestion: string
  reasoning: string
}

export function isColourGradeSuggestion(v: unknown): v is ColourGradeSuggestion {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  return (
    typeof o.shadows === 'number' &&
    typeof o.midtones === 'number' &&
    typeof o.highlights === 'number' &&
    typeof o.temperature === 'number' &&
    typeof o.tint === 'number' &&
    typeof o.saturation === 'number' &&
    typeof o.lutSuggestion === 'string' &&
    typeof o.reasoning === 'string'
  )
}

export function suggestionToClipGrade(suggestion: ColourGradeSuggestion): ClipColourGrade {
  return {
    shadows: suggestion.shadows,
    midtones: suggestion.midtones,
    highlights: suggestion.highlights,
    temperature: suggestion.temperature,
    tint: suggestion.tint,
    asc_cdl: {
      lift: [0, 0, 0],
      gamma: [1, 1, 1],
      gain: [1, 1, 1],
      saturation: suggestion.saturation,
    },
  }
}
