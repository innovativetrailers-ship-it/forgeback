import {
  llmModelForTier,
  postAnthropicMessages,
  postFalRouterChat,
  requireCallerSource,
  type AnthropicMessagesResult,
  type FalRouterMessage,
  type LlmTier,
} from '@cinema/core'
import { GenerationPausedError, isGenerationPaused } from '@/lib/generation/pause'

export type ClaudeBillableClass = 'interactive' | 'eval' | 'background'

/** Real-time user-typing UX only. Everything else respects GENERATION_PAUSED. */
const INTERACTIVE_SOURCES = new Set(['chat.copilot'])

export class AnthropicCallRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'AnthropicCallRefusedError'
  }
}

export type ClaudeMessage = AnthropicMessagesResult

export function claudeText(message: ClaudeMessage): string {
  return message.content
    .filter((block) => block.type === 'text' && block.text)
    .map((block) => block.text ?? '')
    .join('')
}

/**
 * Web brain wrapper. The HTTP call is the core FAL router.
 * `billableClass: 'interactive'` is honored only for INTERACTIVE_SOURCES.
 */
export async function claudeCall(
  params: {
    model: string
    max_tokens: number
    system?: unknown
    messages: unknown[]
    temperature?: number
    top_p?: number
    stop_sequences?: string[]
    response_format?: 'json_object'
  },
  ctx: { source: string; billableClass?: ClaudeBillableClass; tier?: LlmTier },
): Promise<ClaudeMessage> {
  let source: string
  try {
    source = requireCallerSource(ctx?.source)
  } catch {
    throw new AnthropicCallRefusedError('Anthropic call with no caller source — refusing')
  }

  const requested = ctx.billableClass ?? 'background'
  const interactive = requested === 'interactive' && INTERACTIVE_SOURCES.has(source)

  if (isGenerationPaused() && !interactive) {
    throw new GenerationPausedError(`Blocked Anthropic: ${source}`)
  }

  if (requested === 'eval') {
    const { intelligenceProbesEnabled } = await import('@/lib/intelligence/guards')
    if (!intelligenceProbesEnabled()) {
      throw new AnthropicCallRefusedError(`Eval Anthropic blocked: ${source}`)
    }
  }

  const model = ctx.tier ? llmModelForTier(ctx.tier) : params.model
  const requestedParams = model === params.model ? params : { ...params, model }

  try {
    return await postAnthropicMessages({
      model: typeof model === 'string' ? model : requestedParams.model,
      maxTokens: requestedParams.max_tokens,
      system: requestedParams.system,
      messages: requestedParams.messages,
      temperature: requestedParams.temperature,
      topP: requestedParams.top_p,
      stopSequences: requestedParams.stop_sequences,
      responseFormat: requestedParams.response_format,
      source,
      ignorePause: interactive,
    })
  } catch (err) {
    if (!(err instanceof GenerationPausedError) && !(err instanceof AnthropicCallRefusedError)) {
      const { captureGenerationError } = await import('@/lib/diagnostics/capture')
      await captureGenerationError({
        err,
        stage: 'submit',
        endpoint: 'anthropic',
        model: typeof model === 'string' ? model : 'claude',
        purpose: source,
      })
    }
    throw err
  }
}

export type LlmContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

export interface LlmMessage {
  role: 'system' | 'user' | 'assistant'
  content: string | LlmContentPart[]
}

export interface LlmCallResult {
  content: string
  inputTokens: number
  outputTokens: number
}

/**
 * Brain chat, including vision parts. Same FAL router as claudeCall.
 */
export async function llmCall(input: {
  model: string
  messages: LlmMessage[]
  maxTokens?: number
  source: string
}): Promise<LlmCallResult> {
  let source: string
  try {
    source = requireCallerSource(input?.source)
  } catch {
    throw new AnthropicCallRefusedError('FAL router call with no caller source — refusing')
  }
  if (isGenerationPaused()) {
    throw new GenerationPausedError(`Blocked FAL router: ${source}`)
  }
  const model = input.model.trim()
  if (!model) throw new Error('llmCall: model is required')
  console.log('[fal_router_call]', JSON.stringify({
    source,
    model,
    maxTokens: input.maxTokens ?? null,
  }))
  try {
    const result = await postFalRouterChat({
      model,
      messages: input.messages as FalRouterMessage[],
      maxTokens: input.maxTokens,
      source,
    })
    return {
      content: result.content,
      inputTokens: result.inputTokens,
      outputTokens: result.outputTokens,
    }
  } catch (err) {
    if (err instanceof GenerationPausedError || err instanceof AnthropicCallRefusedError) throw err
    const { captureGenerationError } = await import('@/lib/diagnostics/capture')
    await captureGenerationError({
      err,
      stage: 'submit',
      endpoint: 'fal-router',
      model,
      purpose: source,
    })
    throw err
  }
}
