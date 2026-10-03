// Reflective Critic — Reflexion loop: critique the creative plan BEFORE spending
// compute, then return an improved version.

import { callStructured, type CognitiveAgent } from './base'
import { creativeDirectionSchema, type CreativeDirection } from './ideationAgent'
import type { EmotionalArc } from './affectAgent'

export interface CritiqueInput {
  direction: CreativeDirection
  arc: EmotionalArc
  intent: string
  /** Immutable who / what / where. Treatment may not replace it. */
  premise?: string
}

const SYSTEM = `You are a script editor. Strengthen camera, pacing, and emotion.
Do not replace the user's subject, action, character, or setting. Return ONLY JSON.`

export const critiqueAgent: CognitiveAgent<CritiqueInput, CreativeDirection> = {
  name: 'critique',
  fallback: input => input.direction,
  async execute({ direction, arc, intent, premise }) {
    return callStructured({
      system: SYSTEM,
      source: 'cognitive.reflexion',
      maxTokens: 1400,
      schema: creativeDirectionSchema,
      fallback: direction,
      accept: (next) => Boolean(next.concept.trim()),
      user: `User script (binding): ${intent}
Emotional arc: ${arc.shape}
${premise?.trim() ? `PREMISE LOCK (immutable who, what, and where):\n${premise.trim()}\n` : ''}Plan: ${JSON.stringify(direction)}

Improve the treatment only. Return the same JSON shape:
{ "concept", "visualStyle", "scenes": [...], "novelty", "feasibility", "score" }
concept and scenes must still depict the user's subject, action, character, and setting.`,
    })
  },
}
