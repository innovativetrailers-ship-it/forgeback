import { generationPausedFromEnv, requireCallerSource } from '../adapters/chokepoints'
import { openRouterModelId } from '../logic/openRouterChat'
import { assertLlmBudget, recordLlmCall } from './runLedger'

export class MissingFalRouterKeyError extends Error {
  constructor() {
    super('FAL_KEY is not set — cannot reach the language router.')
    this.name = 'MissingFalRouterKeyError'
  }
}

export interface FalRouterMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | Array<{ type: string; text?: string; image_url?: { url: string } }>
}

export interface FalRouterChatResult {
  content: string
  model: string
  inputTokens: number
  outputTokens: number
}

export interface FalRouterChatInput {
  model: string
  messages: FalRouterMessage[]
  maxTokens?: number
  temperature?: number
  source: string
  /** Live web search on the text router. Vision calls ignore this. */
  webSearch?: boolean
  ignorePause?: boolean
  falKey?: string
  timeoutMs?: number
  /** OpenAI JSON mode. The router schema accepts any Chat Completions field. */
  responseFormat?: 'json_object'
}

function falRouterKey(explicit?: string): string {
  const key = (explicit ?? process.env.FAL_KEY ?? process.env.FAL_API_KEY ?? '').trim()
  if (!key) throw new MissingFalRouterKeyError()
  return key
}

function textOfContent(content: FalRouterMessage['content']): string {
  if (typeof content === 'string') return content
  return content
    .filter((part) => part.type === 'text' && part.text)
    .map((part) => part.text ?? '')
    .join('\n')
    .trim()
}

function imageUrlsOf(messages: FalRouterMessage[]): string[] {
  const urls: string[] = []
  for (const message of messages) {
    if (!Array.isArray(message.content)) continue
    for (const part of message.content) {
      const url = part.image_url?.url?.trim()
      if (part.type === 'image_url' && url) urls.push(url)
    }
  }
  return urls
}

function chatText(data: unknown): { content: string; inputTokens: number; outputTokens: number } {
  if (!data || typeof data !== 'object') throw new Error('FAL router returned no text')
  const rec = data as {
    output?: unknown
    choices?: Array<{ message?: { content?: string | null } }>
    usage?: { prompt_tokens?: number; completion_tokens?: number }
    error?: { message?: string } | string
  }
  const fromChoice = rec.choices?.[0]?.message?.content
  const fromOutput = typeof rec.output === 'string' ? rec.output : ''
  const content = (fromChoice ?? fromOutput).trim()
  if (!content) {
    const message = typeof rec.error === 'string' ? rec.error : rec.error?.message
    throw new Error(message || 'FAL router returned no text')
  }
  return {
    content,
    inputTokens: rec.usage?.prompt_tokens ?? 0,
    outputTokens: rec.usage?.completion_tokens ?? 0,
  }
}

/**
 * One LLM egress. Message-shaped calls use the OpenAI-compatible router.
 * Image parts use the vision family. Auth is FAL_KEY. Pause matches video.
 */
export async function postFalRouterChat(
  input: FalRouterChatInput,
  fetchImpl: typeof fetch = fetch,
): Promise<FalRouterChatResult> {
  const source = requireCallerSource(input.source)
  assertLlmBudget(source)
  if (!input.ignorePause && generationPausedFromEnv(process.env.GENERATION_PAUSED)) {
    const paused = new Error(`Blocked FAL router: ${source}`)
    paused.name = 'GenerationPausedError'
    throw paused
  }
  const key = falRouterKey(input.falKey)
  const model = openRouterModelId(input.model)
  const images = imageUrlsOf(input.messages)
  const system = input.messages.find((message) => message.role === 'system')
  const systemPrompt = system ? textOfContent(system.content) : ''
  const prompt = input.messages
    .filter((message) => message.role !== 'system')
    .map((message) => textOfContent(message.content))
    .filter(Boolean)
    .join('\n\n')

  const vision = images.length > 0
  const body = vision
    ? {
        model,
        prompt: prompt || 'Describe the image.',
        ...(systemPrompt ? { system_prompt: systemPrompt } : {}),
        image_urls: images,
        ...(input.maxTokens ? { max_tokens: input.maxTokens } : {}),
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
      }
    : {
        model,
        max_tokens: input.maxTokens ?? 2048,
        messages: input.messages,
        ...(input.temperature !== undefined ? { temperature: input.temperature } : {}),
        ...(input.webSearch ? { enable_web_search: true } : {}),
        ...(input.responseFormat === 'json_object' ? { response_format: { type: 'json_object' } } : {}),
      }

  const started = Date.now()
  const response = await fetchImpl(vision ? 'https://fal.run/openrouter/router/vision' : 'https://fal.run/openrouter/router/openai/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Key ${key}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(input.timeoutMs ?? 120_000),
  })

  const raw = await response.text()
  let data: unknown = null
  try {
    data = raw ? JSON.parse(raw) : null
  } catch {
    data = null
  }
  if (!response.ok) {
    const err = data && typeof data === 'object'
      ? (data as { error?: { message?: string }; detail?: string }).error?.message
        ?? (data as { detail?: string }).detail
      : undefined
    const message = err || `FAL router request failed (${response.status}): ${raw.slice(0, 500)}`
    if (
      input.responseFormat === 'json_object'
      && (response.status === 400 || response.status === 422)
      && /response_format|json_object|structured/i.test(message)
    ) {
      console.warn('[llm_json_mode] provider rejected JSON mode; sending the same prompt as text', message.slice(0, 240))
      return postFalRouterChat({ ...input, responseFormat: undefined }, fetchImpl)
    }
    throw new Error(message)
  }
  const text = chatText(data)
  recordLlmCall({
    purpose: source,
    model,
    promptTokens: text.inputTokens,
    completionTokens: text.outputTokens,
    ms: Date.now() - started,
    caller: source,
  })
  return { ...text, model }
}
