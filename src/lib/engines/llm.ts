import { BRAIN_ROUTES, llmModelForTask, llmModelForTier, type BrainTask, type LlmTier } from '@cinema/core'
import { claudeCall, claudeText, llmCall } from '@/lib/llm/anthropicClient'

export type LLMModel =
  | 'claude-opus'
  | 'claude-sonnet'
  | 'claude-haiku'
  | 'groq-llama'
  | 'xai-grok'
  | 'kimi-k2'
  | 'qwen-max'

const ROUTER_TASK: Record<string, BrainTask> = {
  'groq-llama': 'mechanical',
  'xai-grok': 'character',
  'kimi-k2': 'premise',
  'qwen-max': 'asset',
}

export async function callLLM(params: {
  model:      LLMModel
  system?:    string
  messages:   Array<{ role: 'user' | 'assistant'; content: string }>
  maxTokens?: number
  source?:    string
}): Promise<{ content: string; model: string }> {
  const source = params.source ?? 'llm:callLLM'

  if (
    params.model === 'claude-opus' ||
    params.model === 'claude-sonnet' ||
    params.model === 'claude-haiku'
  ) {
    const tier: LlmTier =
      params.model === 'claude-opus' ? 'hard' :
      params.model === 'claude-haiku' ? 'mechanical' :
      'creative'
    const modelId = llmModelForTier(tier)

    const response = await claudeCall(
      {
        model:      modelId,
        max_tokens: params.maxTokens ?? 1024,
        system:     params.system,
        messages:   params.messages,
      },
      { source, billableClass: 'background', tier },
    )

    const text = claudeText(response)

    return { content: text, model: modelId }
  }

  const task = ROUTER_TASK[params.model]
  if (!task) throw new Error(`Unknown LLM: ${params.model}`)
  const openrouterModel = params.model === 'xai-grok'
    ? BRAIN_ROUTES.character.fallbacks[0]
    : llmModelForTask(task).model

  const result = await llmCall({
    model: openrouterModel,
    maxTokens: params.maxTokens ?? 1024,
    source,
    messages: params.system
      ? [{ role: 'system', content: params.system }, ...params.messages]
      : params.messages,
  })

  return {
    content: result.content,
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
