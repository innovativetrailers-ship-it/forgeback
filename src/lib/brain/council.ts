import { llmModelForTask } from '@cinema/core'
import { llmCall } from '@/lib/llm/anthropicClient'

export interface CouncilInput {
  task: string
  messages: Array<{ role: 'user' | 'assistant'; content: string }>
  requireJSON?: boolean
  reason?: string
}

export interface CouncilOutput {
  content: string
}

// Council is the fallback model when Model1 times out or fails.
// Uses a lighter model for faster recovery.
export async function callCouncil(input: CouncilInput): Promise<CouncilOutput> {
  const systemPrompt = `You are a fallback AI for the CINÉMA system. Task: ${input.task}${input.reason ? ` (Reason for fallback: ${input.reason})` : ''}.${input.requireJSON ? ' Return ONLY valid JSON. No markdown. No preamble.' : ''}`

  const msg = await llmCall({
    model: llmModelForTask('mechanical').model,
    maxTokens: 4096,
    source: 'brain.council',
    messages: [
      { role: 'system', content: systemPrompt },
      ...input.messages,
    ],
  })

  const raw = msg.content
  const content = input.requireJSON
    ? raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
    : raw

  return { content }
}
