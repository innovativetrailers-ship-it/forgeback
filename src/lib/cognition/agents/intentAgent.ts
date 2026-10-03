// Intent Modeler — understand what the user REALLY wants, beyond the literal prompt.

import { z } from 'zod'
import { callStructured, type CognitiveAgent } from './base'
import { recallSemantic } from '../memory/semantic'

export interface Intent {
  literalRequest: string
  inferredGoal: string
  targetEmotion: string
  audience: string
  references: string[]
  unstatedNeeds: string[]
  energyLevel: 'calm' | 'building' | 'high' | 'explosive'
  confidence: number
}

export interface IntentInput {
  userId: string
  prompt: string
}

const ENERGY = ['calm', 'building', 'high', 'explosive'] as const

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

const intentSchema = z.object({
  literalRequest: z.string().default(''),
  inferredGoal: z.string().default(''),
  targetEmotion: z.string().default('neutral'),
  audience: z.string().default('general'),
  references: z.unknown().optional().transform(stringList),
  unstatedNeeds: z.unknown().optional().transform(stringList),
  energyLevel: z.unknown().optional().transform((value): Intent['energyLevel'] =>
    typeof value === 'string' && (ENERGY as readonly string[]).includes(value) ? value as Intent['energyLevel'] : 'building',
  ),
  confidence: z.unknown().optional().transform((value) =>
    typeof value === 'number' && Number.isFinite(value) ? value : 0.3,
  ),
})

const SYSTEM = `You are a perceptive creative director. Name the feeling of a video request.
literalRequest must keep the user's subject, action, character, and setting in their words.
inferredGoal may describe the feeling. Do not replace who, what, or where.
Return ONLY valid JSON with keys literalRequest, inferredGoal, targetEmotion, audience,
references, unstatedNeeds, energyLevel, confidence.`

function fallback(input: IntentInput): Intent {
  return {
    literalRequest: input.prompt,
    inferredGoal: input.prompt,
    targetEmotion: 'neutral',
    audience: 'general',
    references: [],
    unstatedNeeds: [],
    energyLevel: 'building',
    confidence: 0.3,
  }
}

export const intentAgent: CognitiveAgent<IntentInput, Intent> = {
  name: 'intent',
  fallback,
  async execute(input) {
    const taste = (await recallSemantic(input.userId, input.prompt, 5).catch((err) => {
      console.warn("[caught] src/lib/cognition/agents/intentAgent.ts:68", err instanceof Error ? { name: err.name, message: err.message } : err)
      return ([])
    })) ?? []
    const tasteContext = taste.length
      ? `Known preferences for this user:\n${taste.map(t => `- ${t.insight}`).join('\n')}`
      : 'No prior preferences known yet.'

    return callStructured({
      system: SYSTEM,
      source: 'cognitive.intent',
      maxTokens: 800,
      schema: intentSchema,
      fallback: fallback(input),
      accept: (intent) => Boolean(intent.inferredGoal.trim() || intent.literalRequest.trim()),
      user: `Request: "${input.prompt}"

${tasteContext}

Infer the deeper intent. Return JSON:
{
  "literalRequest": "what they literally asked for",
  "inferredGoal": "what they're really trying to achieve",
  "targetEmotion": "the dominant feeling the film should evoke",
  "audience": "who this is likely for",
  "references": ["implied stylistic or tonal references"],
  "unstatedNeeds": ["things they didn't say but likely want"],
  "energyLevel": "calm|building|high|explosive",
  "confidence": 0.0-1.0
}`,
    })
  },
}
