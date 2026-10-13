// Shared Claude caller for all cognitive agents — one place to tune model + parsing.
// Routes through the project's callLLM helper (Anthropic SDK) rather than a bespoke
// fetch, so credits/keys/model-ids stay consistent with the rest of the app.

import type { z } from 'zod'
import { callLLM } from '@/lib/engines/llm'
import { parseLLMJson, validateLLMJson } from '../json'

const STRICT_JSON = 'Return ONLY one JSON object with the exact keys requested. Use [] for missing arrays and "" for missing strings. No markdown, no prose.'

export async function callAgentLLM(params: {
  system: string
  user: string
  maxTokens?: number
  fast?: boolean // use Haiku for cheap/quick agents
  source?: string
}): Promise<string> {
  const { content } = await callLLM({
    model: params.fast ? 'claude-haiku' : 'claude-sonnet',
    source: params.source ?? 'cognition.agent',
    maxTokens: params.maxTokens ?? 800,
    system: params.system,
    messages: [{ role: 'user', content: params.user }],
  })
  return content
}

// Safe JSON parse for agent outputs (strips markdown fences, tolerates prose).
export const parseAgentJSON = parseLLMJson

/**
 * One structured read, then a single stricter retry, then the fallback.
 * A missing or malformed LLM object degrades; it does not throw.
 */
export async function callStructured<T>(params: {
  system: string
  user: string
  schema: z.ZodType<T>
  fallback: T
  maxTokens?: number
  fast?: boolean
  source?: string
  accept?: (value: T) => boolean
}): Promise<T> {
  const read = async (system: string): Promise<T | null> => {
    const text = await callAgentLLM({
      system,
      user: params.user,
      maxTokens: params.maxTokens,
      fast: params.fast,
      source: params.source,
    })
    const value = validateLLMJson(text, params.schema)
    if (!value) return null
    if (params.accept && !params.accept(value)) return null
    return value
  }

  const first = await read(params.system)
  if (first) return first
  const second = await read(`${params.system}\n\n${STRICT_JSON}`)
  return second ?? params.fallback
}

export interface CognitiveAgent<Input, Output> {
  name: string
  fallback: (input: Input) => Output
  execute: (input: Input) => Promise<Output>
}
