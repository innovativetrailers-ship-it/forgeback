import { claudeCall } from '@/lib/llm/anthropicClient'
import type { TimelineRecipe, Clip } from '@/lib/timeline/schema'
import {
  isColourGradeSuggestion,
  suggestionToClipGrade,
  type ColourGradeSuggestion,
  type ColourMood,
} from '@/lib/color/colourGradeShape'

export type { ColourMood, ColourGradeSuggestion }
export { isColourGradeSuggestion, suggestionToClipGrade }

export interface ColourGradeRequest {
  clipId: string
  frameUrl: string
  mood: ColourMood
  targetLook?: string
}

// ─── Mood profiles ────────────────────────────────────────────────────────────

const MOOD_PROFILES: Record<ColourMood, { description: string; tempDirection: string; contrast: string; sat: string; exampleLuts: string[] }> = {
  warm: {
    description: 'Golden-hour warmth — amber and orange tones dominate',
    tempDirection: 'Push warm (4000–5500K range)',
    contrast: 'Gentle S-curve, lifted blacks',
    sat: 'Slightly boosted especially in skin tones',
    exampleLuts: ['Golden Hour', 'Kodachrome 64', 'Fuji Velvia 50'],
  },
  cool: {
    description: 'Clinical cool — blue and teal shadows, desaturated mids',
    tempDirection: 'Push cool (7000–9500K range)',
    contrast: 'Flat contrast, crushed highlights',
    sat: 'Desaturated with selective cyan boost',
    exampleLuts: ['Teal & Orange', 'Silver Shadows', 'Digital Blue'],
  },
  cinematic: {
    description: 'Hollywood filmic — teal shadows, warm highlights, strong contrast',
    tempDirection: 'Split: cool shadows (7500K) / warm highlights (4500K)',
    contrast: 'Strong S-curve, crushed blacks to ~10%',
    sat: 'Selective — skin warm, backgrounds cool',
    exampleLuts: ['Blade Runner 2049', 'Teal & Orange Pro', 'Cinematic Grade'],
  },
  vintage: {
    description: 'Film emulation — faded, cross-processed, grain-ready',
    tempDirection: 'Slight warm cast (5500K) with green mids',
    contrast: 'Lifted blacks (faded), reduced highlight contrast',
    sat: 'Muted, pastel — avoid pure whites',
    exampleLuts: ['Kodachrome 25', 'Ektachrome 100', 'Super 8 Faded'],
  },
  moody: {
    description: 'Dark, dramatic — deep shadows, low key, desaturated',
    tempDirection: 'Neutral to cool (6500–7500K)',
    contrast: 'Heavy contrast — crushed blacks, compressed highlights',
    sat: 'Heavily desaturated, near monochrome in shadows',
    exampleLuts: ['Dark & Stormy', 'Seven Grade', 'Neon Noir'],
  },
}

// ─── Clamping ─────────────────────────────────────────────────────────────────

function clampInt(v: number, min: number, max: number): number {
  return Math.round(Math.min(max, Math.max(min, v)))
}

function clampFloat(v: number, min: number, max: number, dp: number): number {
  const f = Math.pow(10, dp)
  return Math.round(Math.min(max, Math.max(min, v)) * f) / f
}

function clampSuggestion(raw: ColourGradeSuggestion): ColourGradeSuggestion {
  return {
    shadows: clampInt(raw.shadows, -100, 100),
    midtones: clampInt(raw.midtones, -100, 100),
    highlights: clampInt(raw.highlights, -100, 100),
    temperature: clampInt(raw.temperature, 2700, 10000),
    tint: clampInt(raw.tint, -100, 100),
    saturation: clampFloat(raw.saturation, 0, 2, 2),
    lutSuggestion: raw.lutSuggestion,
    reasoning: raw.reasoning,
  }
}

// ─── Main export: suggest colour grade ───────────────────────────────────────

export async function suggestColourGrade(params: ColourGradeRequest): Promise<ColourGradeSuggestion> {
  try { new URL(params.frameUrl) } catch {
    throw new Error(`Invalid frameUrl: "${params.frameUrl}"`)
  }

  const profile = MOOD_PROFILES[params.mood]
  const lookSection = params.targetLook
    ? `\nTARGET LOOK: "${params.targetLook}" — bias your output toward this specific reference.`
    : ''

  const systemPrompt = `You are a DIT (Digital Imaging Technician) AI for Cinematic Forge professional video editor.
Analyse still frames and return precise colour grading parameters.
Output ONLY valid JSON — no markdown, no commentary outside JSON.

OUTPUT SCHEMA (all ranges are mandatory):
{
  "shadows": 0,         // integer, -100 to +100
  "midtones": 0,        // integer, -100 to +100
  "highlights": 0,      // integer, -100 to +100
  "temperature": 6500,  // integer, 2700 to 10000 (Kelvin)
  "tint": 0,            // integer, -100 to +100
  "saturation": 1.0,    // float 2dp, 0.0 to 2.0 (1.0 = unchanged)
  "lutSuggestion": "string",
  "reasoning": "string — 2-3 sentences explaining your analysis"
}`

  const userPrompt = `Analyse this frame and propose colour grading to achieve: ${params.mood.toUpperCase()} mood.

MOOD PROFILE:
- ${profile.description}
- Colour temperature: ${profile.tempDirection}
- Contrast: ${profile.contrast}
- Saturation: ${profile.sat}
- Example LUTs: ${profile.exampleLuts.join(', ')}
${lookSection}

Consider: current exposure, colour temperature, contrast ratio, dominant hues.
Output ONLY the JSON object.`

  const response = await claudeCall({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 512,
    system: systemPrompt,
    messages: [{
      role: 'user',
      content: [
        { type: 'image', source: { type: 'url', url: params.frameUrl } },
        { type: 'text', text: userPrompt },
      ],
    }],
  }, { source: 'color.aigrade' })

  const textBlock = response.content.find((b) => b.type === 'text')
  if (!textBlock || textBlock.type !== 'text') {
    throw new Error('Anthropic returned no text content for colour grade')
  }

  let jsonText = (textBlock.text ?? '').trim()
  const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/)
  if (fenceMatch) jsonText = fenceMatch[1].trim()

  let parsed: unknown
  try {
    parsed = JSON.parse(jsonText)
  } catch {
    throw new Error(`Failed to parse colour grade JSON. Raw: ${jsonText.slice(0, 400)}`)
  }

  if (!isColourGradeSuggestion(parsed)) {
    const keys = typeof parsed === 'object' && parsed !== null ? Object.keys(parsed).join(', ') : String(typeof parsed)
    throw new Error(`Colour grade response does not match schema. Keys: ${keys}`)
  }

  return clampSuggestion(parsed)
}

// ─── Map AI suggestion to ClipColourGrade ────────────────────────────────────

// ─── Apply to recipe ──────────────────────────────────────────────────────────

export function applyColourGradeToClip(
  clipId: string,
  suggestion: ColourGradeSuggestion,
  recipe: TimelineRecipe,
): TimelineRecipe {
  let found = false
  const grade = suggestionToClipGrade(suggestion)

  const updatedTracks = recipe.tracks.map((track) => {
    const updatedClips = track.clips.map((clip: Clip) => {
      if (clip.id !== clipId) return clip
      found = true
      return { ...clip, colourGrade: grade }
    })
    if (updatedClips === track.clips) return track
    return { ...track, clips: updatedClips }
  })

  if (!found) throw new Error(`Clip "${clipId}" not found in recipe`)
  return { ...recipe, tracks: updatedTracks }
}
