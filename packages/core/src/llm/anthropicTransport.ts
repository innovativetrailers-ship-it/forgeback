import { postFalRouterChat, type FalRouterMessage } from './falRouter'

export class MissingApiKeyError extends Error {
  constructor() {
    super('FAL_KEY is not set — cannot reach the language router.')
    this.name = 'MissingApiKeyError'
  }
}

export class MissingWorkspaceError extends Error {
  constructor() {
    super('FAL router call is missing a caller source.')
    this.name = 'MissingWorkspaceError'
  }
}

export interface AnthropicContentBlock {
  type: string
  text?: string
  id?: string
  name?: string
  input?: unknown
  source?: unknown
}

export interface AnthropicMessagesResult {
  id: string
  type: 'message'
  role: 'assistant'
  model: string
  content: AnthropicContentBlock[]
  stop_reason: string | null
  usage: { input_tokens: number; output_tokens: number }
}

export interface AnthropicMessagesInput {
  model: string
  maxTokens: number
  system?: unknown
  messages: unknown[]
  temperature?: number
  topP?: number
  stopSequences?: string[]
  timeoutMs?: number
  /** Ignored. The router authenticates with FAL_KEY. */
  apiKey?: string
  /** Ignored. Kept so older callers still type-check. */
  workspaceId?: string
  falKey?: string
  source: string
  /** Set only after the caller already allowed a named interactive source. */
  ignorePause?: boolean
  responseFormat?: 'json_object'
}

export function anthropicMessageText(result: AnthropicMessagesResult): string {
  return result.content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text ?? '')
    .join('')
    .trim()
}

function blockText(content: unknown): string {
  if (typeof content === 'string') return content
  if (!Array.isArray(content)) return ''
  return content.map((block) => {
    if (!block || typeof block !== 'object') return ''
    const rec = block as { type?: string; text?: string }
    return rec.type === 'text' && rec.text ? rec.text : ''
  }).filter(Boolean).join('\n')
}

function imageUrlFromBlock(block: unknown): string | null {
  if (!block || typeof block !== 'object') return null
  const rec = block as {
    type?: string
    source?: { type?: string; url?: string; media_type?: string; data?: string }
  }
  if (rec.type !== 'image' || !rec.source) return null
  if (rec.source.type === 'url' && rec.source.url) return rec.source.url
  if (rec.source.type === 'base64' && rec.source.data) {
    const media = rec.source.media_type || 'image/jpeg'
    return `data:${media};base64,${rec.source.data}`
  }
  return null
}

function toRouterMessages(system: unknown, messages: unknown[]): FalRouterMessage[] {
  const out: FalRouterMessage[] = []
  const systemText = blockText(system).trim()
  if (systemText) out.push({ role: 'system', content: systemText })
  for (const message of messages) {
    if (!message || typeof message !== 'object') continue
    const rec = message as { role?: string; content?: unknown }
    const role = rec.role === 'assistant' ? 'assistant' : 'user'
    const images: string[] = []
    if (Array.isArray(rec.content)) {
      for (const block of rec.content) {
        const url = imageUrlFromBlock(block)
        if (url) images.push(url)
      }
    }
    const text = blockText(rec.content).trim()
    if (images.length) {
      out.push({
        role,
        content: [
          ...images.map((url) => ({ type: 'image_url' as const, image_url: { url } })),
          ...(text ? [{ type: 'text' as const, text }] : []),
        ],
      })
    } else if (text) {
      out.push({ role, content: text })
    }
  }
  if (!out.some((message) => message.role !== 'system')) {
    throw new Error('FAL router call has no user message')
  }
  return out
}

export async function postAnthropicMessages(
  input: AnthropicMessagesInput,
): Promise<AnthropicMessagesResult> {
  const result = await postFalRouterChat({
    model: input.model,
    messages: toRouterMessages(input.system, input.messages),
    maxTokens: input.maxTokens,
    temperature: input.temperature,
    source: input.source,
    ignorePause: input.ignorePause,
    falKey: input.falKey,
    timeoutMs: input.timeoutMs,
    responseFormat: input.responseFormat,
  })
  return {
    id: '',
    type: 'message',
    role: 'assistant',
    model: result.model,
    content: [{ type: 'text', text: result.content }],
    stop_reason: 'end_turn',
    usage: {
      input_tokens: result.inputTokens,
      output_tokens: result.outputTokens,
    },
  }
}
