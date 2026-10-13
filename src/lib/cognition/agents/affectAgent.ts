// Affective Director — design the emotional arc and rhythmic pacing of the film,
// enriched (when available) with relational craft rules from the knowledge graph.

import { z } from 'zod'
import { callStructured, type CognitiveAgent } from './base'
import { recommendCraft } from '../routing/knowledgeGraph'
import type { Intent } from './intentAgent'

export interface EmotionalBeat {
  position: number
  emotion: string
  intensity: number
  pacing: 'lingering' | 'measured' | 'brisk' | 'rapid'
  purpose: string
}

export interface EmotionalArc {
  shape: string
  beats: EmotionalBeat[]
  rhythmNote: string
}

export interface AffectInput {
  intent: Intent
  durationSec: number
}

const PACING = ['lingering', 'measured', 'brisk', 'rapid'] as const

const beatSchema = z.object({
  position: z.number().default(0),
  emotion: z.string().default(''),
  intensity: z.number().default(0.5),
  pacing: z.enum(PACING).default('measured'),
  purpose: z.string().default(''),
})

const emotionalArcSchema = z.object({
  shape: z.string().default(''),
  rhythmNote: z.string().default(''),
  beats: z.unknown().optional().transform((value): EmotionalBeat[] => {
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => {
      const parsed = beatSchema.safeParse(item && typeof item === 'object' ? item : {})
      return parsed.success ? [parsed.data] : []
    })
  }),
})

const SYSTEM = `You are a film editor and composer who thinks in emotional rhythm. Design the
felt experience of a film over time — where it breathes, where it accelerates, where it lands.
Pacing is a craft: lingering shots build weight, rapid cuts build energy. Return ONLY JSON
with keys shape, rhythmNote, and beats.`

function fallback(): EmotionalArc {
  return { shape: 'steady_build', rhythmNote: 'Even, building pace', beats: [] }
}

export const affectAgent: CognitiveAgent<AffectInput, EmotionalArc> = {
  name: 'affect',
  fallback,
  async execute({ intent, durationSec }) {
    const craft = (await recommendCraft(intent.targetEmotion, 2).catch((err) => {
      console.warn("[caught] src/lib/cognition/agents/affectAgent.ts:63", err instanceof Error ? { name: err.name, message: err.message } : err)
      return ([])
    })) ?? []
    const craftLine = craft.length
      ? `\nProven craft pairings for ${intent.targetEmotion}: ${craft.join(', ')}.`
      : ''

    return callStructured({
      system: SYSTEM,
      source: 'cognitive.arc',
      maxTokens: 1000,
      schema: emotionalArcSchema,
      fallback: fallback(),
      accept: (arc) => Boolean(arc.shape.trim() || arc.beats.length),
      user: `Film intent:
- Goal: ${intent.inferredGoal}
- Target emotion: ${intent.targetEmotion}
- Energy: ${intent.energyLevel}
- Duration: ${durationSec}s${craftLine}

Design the emotional arc. Return JSON:
{
  "shape": "rising|rise_fall|fall_rise|steady_build|rollercoaster",
  "rhythmNote": "one sentence on the overall rhythmic intention",
  "beats": [
    { "position": 0.0-1.0, "emotion": "...", "intensity": 0.0-1.0,
      "pacing": "lingering|measured|brisk|rapid", "purpose": "..." }
  ]
}
Use 3-6 beats that sum to a satisfying emotional journey.`,
    })
  },
}
