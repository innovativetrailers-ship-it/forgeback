export class NonTextChatError extends Error {
  constructor() {
    super('Chat payload includes non-text content')
    this.name = 'NonTextChatError'
  }
}

/** Anthropic ids use claude-haiku-4-5. OpenRouter examples use anthropic/claude-haiku-4.5. */
export function openRouterModelId(model: string): string {
  const id = model.trim()
  if (!id) throw new Error('openRouterModelId: model is required')
  if (id.includes('/')) return id
  const dotted = id.replace(/-(\d+)-(\d+)$/, '-$1.$2')
  return `anthropic/${dotted}`
}

function textOf(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) throw new NonTextChatError()
  return content.map((block) => {
    if (!block || typeof block !== 'object') throw new NonTextChatError()
    const rec = block as { type?: string; text?: string }
    if (rec.type && rec.type !== 'text') throw new NonTextChatError()
    if (typeof rec.text !== 'string') throw new NonTextChatError()
    return rec.text
  }).join('\n')
}

/**
 * Verified FAL `openrouter/router` input: model, prompt, system_prompt, max_tokens.
 * Image and tool blocks are refused so they are not dropped on the floor.
 */
export function openRouterChatInput(args: {
  model: string
  system?: unknown
  messages: unknown[]
  maxTokens?: number
}): { model: string; prompt: string; system_prompt?: string; max_tokens?: number } {
  const system = args.system == null || args.system === '' ? undefined : textOf(args.system).trim()
  const lines = args.messages.map((message) => {
    if (!message || typeof message !== 'object') throw new NonTextChatError()
    const rec = message as { role?: string; content?: unknown }
    const role = rec.role?.trim() || 'user'
    const text = textOf(rec.content).trim()
    return text ? `${role}: ${text}` : ''
  }).filter(Boolean)
  const prompt = lines.join('\n\n')
  if (!prompt) throw new Error('openRouterChatInput: prompt is empty')
  return {
    model: openRouterModelId(args.model),
    prompt,
    ...(system ? { system_prompt: system } : {}),
    ...(args.maxTokens ? { max_tokens: args.maxTokens } : {}),
  }
}

export function openRouterOutputText(data: unknown): string {
  if (!data || typeof data !== 'object') throw new Error('OpenRouter router returned no text')
  const output = (data as { output?: unknown }).output
  if (typeof output === 'string' && output.trim()) return output
  const error = (data as { error?: unknown }).error
  if (typeof error === 'string' && error.trim()) throw new Error(error)
  throw new Error('OpenRouter router returned no text')
}
