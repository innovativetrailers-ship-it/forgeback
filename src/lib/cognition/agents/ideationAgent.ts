// Creative Ideator — Tree of Thoughts: branch several creative directions, score,
// and pick the most captivating yet feasible.

import { z } from 'zod'
import { callStructured, type CognitiveAgent } from './base'
import type { CreativeLicense } from '../license'
import type { Intent } from './intentAgent'
import type { EmotionalArc } from './affectAgent'

export interface CreativeDirection {
  concept: string
  visualStyle: string
  scenes: string[]
  novelty: number
  feasibility: number
  score: number
}

export interface IdeationInput {
  intent: Intent
  arc: EmotionalArc
  pastWins: string[]
  script: string
  license?: CreativeLicense
  /** Immutable who / what / where. Treatment may not replace it. */
  premise?: string
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.flatMap((item) => {
    if (typeof item === 'string' && item.trim()) return [item.trim()]
    if (item && typeof item === 'object') {
      const rec = item as Record<string, unknown>
      const text = typeof rec.description === 'string' ? rec.description : typeof rec.name === 'string' ? rec.name : ''
      return text.trim() ? [text.trim()] : []
    }
    return []
  })
}

function unit(fallback: number) {
  return z.unknown().optional().transform((value) =>
    typeof value === 'number' && Number.isFinite(value) ? value : fallback,
  )
}

export const creativeDirectionSchema = z.object({
  concept: z.string().default(''),
  visualStyle: z.string().default(''),
  scenes: z.unknown().optional().transform(stringList),
  novelty: unit(0.5),
  feasibility: unit(0.8),
  score: unit(0.65),
})

function systemFor(license: CreativeLicense): string {
  const ground = license === 'interpretive'
    ? `You may heighten how the scene is told. You must keep the user's subject, action, character, and setting.`
    : `Elaborate the cinematic treatment of THIS scene. Do not change the subject, action, character, or location. Do not invent a different story.`
  return `You are a cinematographer choosing how to film the user's script. ${ground}
Add mood, pacing, camera, lighting, and style. Return ONLY JSON with keys concept, visualStyle, scenes, novelty, feasibility, score.`
}

function fallback(input: IdeationInput): CreativeDirection {
  const script = input.script?.trim() || input.intent.literalRequest || input.intent.inferredGoal
  return {
    concept: script,
    visualStyle: 'cinematic',
    scenes: [],
    novelty: 0.5,
    feasibility: 0.8,
    score: 0.65,
  }
}

export const ideationAgent: CognitiveAgent<IdeationInput, CreativeDirection> = {
  name: 'ideation',
  fallback,
  async execute(input) {
    const { intent, arc, pastWins } = input
    const license = input.license ?? 'faithful'
    const wins = pastWins ?? []
    const script = input.script?.trim() || intent.literalRequest || ''
    return callStructured({
      system: systemFor(license),
      source: 'cognitive.ideation',
      maxTokens: 1600,
      schema: creativeDirectionSchema,
      fallback: fallback(input),
      accept: (direction) => Boolean(direction.concept.trim()),
      user: `USER SCRIPT (binding — same subject, action, character, and setting):
"""
${script}
"""

Feeling to evoke: ${intent.targetEmotion}
Emotional arc: ${arc.shape} — ${arc.rhythmNote}
${wins.length ? `What worked before for this user:\n${wins.map(w => `- ${w}`).join('\n')}` : ''}
${input.premise?.trim() ? `\nPREMISE LOCK (immutable who, what, and where — do not change these):\n${input.premise.trim()}\n` : ''}

Return one cinematic treatment of THIS script as JSON. scenes are elaborations of the user's scenes, not a new film.
{
  "concept": "the user's scene, stated faithfully",
  "visualStyle": "look and feel only",
  "scenes": ["the user's scene with camera, light, and mood added"],
  "novelty": 0.0-1.0,
  "feasibility": 0.0-1.0,
  "score": 0.0-1.0
}`,
    })
  },
}
