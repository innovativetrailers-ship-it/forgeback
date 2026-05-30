import Anthropic from '@anthropic-ai/sdk'

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY! })

export type LLMModel =
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'groq-llama'
  | 'xai-grok'
  | 'kimi-k2'
  | 'qwen-max'

const OPENROUTER_IDS: Record<string, string> = {
  'groq-llama': 'groq/llama-3.3-70b-versatile',
  'xai-grok':   'x-ai/grok-3',
  'kimi-k2':    'moonshotai/kimi-k2-0905',
  'qwen-max':   'qwen/qwen3-7b-max',
}

interface FalOpenRouterResponse {
  output?: {
    choices?: Array<{
      message?: { content?: string }
    }>
  }
}

export async function callLLM(params: {
  model:      LLMModel
  system?:    string
  messages:   Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
}): Promise<{ content: string; model: string }> {

  if (params.model === 'claude-sonnet' || params.model === 'claude-haiku') {
    const modelId = params.model === 'claude-sonnet'
      ? 'claude-sonnet-4-6'
      : 'claude-haiku-4-5'

    const response = await anthropic.messages.create({
      model:      modelId,
      max_tokens: params.maxTokens ?? 1024,
      system:     params.system,
      messages:   params.messages,
    })

    const text = response.content
      .filter(b => b.type === 'text')
      .map(b => (b as Anthropic.TextBlock).text)
      .join('')

    return { content: text, model: modelId }
  }

  const openrouterModel = OPENROUTER_IDS[params.model]
  if (!openrouterModel) throw new Error(`Unknown LLM: ${params.model}`)

  const result = await fetch('https://fal.run/openrouter/router', {
    method:  'POST',
    headers: {
      Authorization:  `Key ${process.env.FAL_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      input: {
        model:      openrouterModel,
        messages:   params.system
          ? [{ role: 'system', content: params.system }, ...params.messages]
          : params.messages,
        max_tokens: params.maxTokens ?? 1024,
      },
    }),
  }).then(r => r.json()) as FalOpenRouterResponse

  return {
    content: result.output?.choices?.[0]?.message?.content ?? '',
    model:   openrouterModel,
  }
}

export function selectLLMForTask(
  task: 'orchestration' | 'fast' | 'reasoning' | 'long_context'
): LLMModel {
  switch (task) {
    case 'orchestration': return 'claude-sonnet'
    case 'fast':          return 'groq-llama'
    case 'reasoning':     return 'xai-grok'
    case 'long_context':  return 'kimi-k2'
    default:              return 'claude-sonnet'
  }
}
