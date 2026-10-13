import { llmModelForTask } from '@cinema/core'
import { llmCall, type LlmContentPart } from '@/lib/llm/anthropicClient'

export interface Model1Input {
  systemPrompt: string
  userMessage: string
  requireJSON?: boolean
  useAgenticLoop?: boolean
  images?: string[]  // base64 or URL strings for vision
}

export interface Model1Output {
  content: string
  inputTokens: number
  outputTokens: number
}

export async function runModel1(input: Model1Input): Promise<Model1Output> {
  const userContent: LlmContentPart[] = []

  if (input.images?.length) {
    for (const img of input.images) {
      if (img.startsWith('http')) {
        userContent.push({
          type: 'image_url',
          image_url: { url: img },
        })
      } else {
        userContent.push({
          type: 'image_url',
          image_url: { url: `data:image/jpeg;base64,${img}` },
        })
      }
    }
  }

  userContent.push({ type: 'text', text: input.userMessage })

  const msg = await llmCall({
    model: llmModelForTask('mechanical').model,
    maxTokens: input.requireJSON ? 4096 : 2048,
    source: 'brain.model1',
    messages: [
      { role: 'system', content: input.systemPrompt },
      { role: 'user', content: userContent },
    ],
  })

  const text = msg.content

  // Strip markdown code fences if the caller expects raw JSON
  const content = input.requireJSON ? stripJSONFences(text) : text

  return {
    content,
    inputTokens: msg.inputTokens,
    outputTokens: msg.outputTokens,
  }
}

function stripJSONFences(raw: string): string {
  return raw.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim()
}
