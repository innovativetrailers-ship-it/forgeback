export const ERROR_STAGES = ['submit', 'poll', 'completion', 'assembly', 'runtime'] as const
export type ErrorStage = (typeof ERROR_STAGES)[number]

export const ERROR_CATEGORIES = [
  'content_flag',
  'payload_over_limit',
  'field_mismatch',
  'namespace_bad',
  'provider_transient',
  'auth_config',
  'unsupported_mode',
  'code_error',
  'unknown',
] as const
export type ErrorCategory = (typeof ERROR_CATEGORIES)[number]

export const ERROR_ACTIONS = [
  'retry',
  'alter_prompt',
  'reduce_refs',
  'change_model',
  'wait_retry',
  'reduce_duration',
] as const
export type ErrorAction = (typeof ERROR_ACTIONS)[number]

export interface ShotError {
  shotId?: string
  model?: string
  mode?: string
  purpose?: string
  endpoint: string
  stage: ErrorStage
  httpStatus?: number
  falRequestId?: string
  rawError: string
  providerLogs?: string[]
  payloadSnapshot?: Record<string, unknown>
  timestamp?: string
}

export interface InterpretedError {
  userMessage: string
  suggestedAction: ErrorAction
  category: ErrorCategory
  correctable: boolean
  correction?: string
}

export function isErrorCategory(value: string): value is ErrorCategory {
  return (ERROR_CATEGORIES as readonly string[]).includes(value)
}

export function isErrorAction(value: string): value is ErrorAction {
  return (ERROR_ACTIONS as readonly string[]).includes(value)
}

/** Strip ids/urls so the same class shares a cache key. */
export function normalizeErrorSignature(raw: string): string {
  return raw
    .toLowerCase()
    .replace(/https?:\/\/\S+/g, '{url}')
    .replace(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/g, '{id}')
    .replace(/[a-z0-9_-]{20,}/g, '{token}')
    .replace(/\d+/g, '{n}')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 400)
}

export function interpretErrorRules(rawError: string, httpStatus?: number): InterpretedError {
  const text = rawError.toLowerCase()
  if (
    /content checker|safety checker|nsfw|flagged for content|content policy/.test(text)
  ) {
    return {
      userMessage: 'The prompt was flagged for content — try rephrasing.',
      suggestedAction: 'alter_prompt',
      category: 'content_flag',
      correctable: false,
    }
  }
  if (/at most|should have at most|too many|max(imum)? (items|images|refs|characters)/.test(text)) {
    return {
      userMessage: 'This shot sent more than the model accepts (prompt, duration, or references).',
      suggestedAction: 'reduce_refs',
      category: 'payload_over_limit',
      correctable: true,
      correction: 'trim references to 12; cap prompt; clamp duration to the model range',
    }
  }
  if (/field required|input should be|validation error|unprocessable/.test(text) || httpStatus === 422) {
    return {
      userMessage: 'The request shape did not match this model. Retry after a field check, or pick another model.',
      suggestedAction: 'change_model',
      category: 'field_mismatch',
      correctable: true,
      correction: 'reverify endpoint fields via OpenAPI',
    }
  }
  if (httpStatus === 404 || /not found|no such app|unknown endpoint/.test(text)) {
    return {
      userMessage: 'This model endpoint is missing or renamed. Pick another model.',
      suggestedAction: 'change_model',
      category: 'namespace_bad',
      correctable: true,
      correction: 'reverify endpoint id via OpenAPI',
    }
  }
  if (
    httpStatus === 408 ||
    (httpStatus != null && httpStatus >= 500) ||
    /timeout|timed out|econnreset|503|502|504|rate limit|temporar/.test(text)
  ) {
    return {
      userMessage: 'The provider is busy or timed out. Wait a moment and retry.',
      suggestedAction: 'wait_retry',
      category: 'provider_transient',
      correctable: true,
      correction: 'retry',
    }
  }
  if (/workspace|api key|unauthorized|forbidden|invalid key|authentication/.test(text) || httpStatus === 401 || httpStatus === 403) {
    return {
      userMessage: 'The provider rejected the credentials. Check API configuration.',
      suggestedAction: 'retry',
      category: 'auth_config',
      correctable: false,
    }
  }
  if (/mutually exclusive|mode not supported|does not support|unsupported/.test(text)) {
    return {
      userMessage: 'This model does not support that generation mode. Pick another model.',
      suggestedAction: 'change_model',
      category: 'unsupported_mode',
      correctable: false,
    }
  }
  if (
    /cannot read propert(y|ies) of (undefined|null)|is not a function|is not iterable|undefined is not an object/.test(
      text,
    )
  ) {
    return {
      userMessage: 'A code error crashed this shot. The technical details are saved.',
      suggestedAction: 'retry',
      category: 'code_error',
      correctable: false,
    }
  }
  if (/duration|too short|too long|minimum.*seconds/.test(text)) {
    return {
      userMessage: 'The duration is outside what this model allows.',
      suggestedAction: 'reduce_duration',
      category: 'payload_over_limit',
      correctable: true,
      correction: 'clamp duration to the model range',
    }
  }
  return {
    userMessage: 'This shot failed. Retry, or open the technical details.',
    suggestedAction: 'retry',
    category: 'unknown',
    correctable: false,
  }
}

export function providerBodyText(body: unknown): string {
  if (body == null) return ''
  if (typeof body === 'string') return body
  if (typeof body === 'object') {
    const row = body as Record<string, unknown>
    if (typeof row.detail === 'string') return row.detail
    if (Array.isArray(row.detail)) return JSON.stringify(row.detail)
    if (typeof row.message === 'string') return row.message
    if (typeof row.error === 'string') return row.error
    try {
      return JSON.stringify(body)
    } catch {
      return String(body)
    }
  }
  return String(body)
}

export function collectProviderLogs(body: unknown): string[] {
  if (!body || typeof body !== 'object') return []
  const logs = (body as { logs?: unknown }).logs
  if (!Array.isArray(logs)) return []
  return logs
    .map((line) => {
      if (typeof line === 'string') return line
      if (line && typeof line === 'object') {
        const row = line as { message?: unknown; msg?: unknown }
        if (typeof row.message === 'string') return row.message
        if (typeof row.msg === 'string') return row.msg
      }
      try {
        return JSON.stringify(line)
      } catch {
        return ''
      }
    })
    .filter((line) => line.trim().length > 0)
}

/** FAL status/result URLs omit logs unless asked — `logs=1` is the with_logs subscribe equivalent. */
export function urlWithProviderLogs(url: string): string {
  try {
    const parsed = new URL(url)
    if (!parsed.searchParams.has('logs')) parsed.searchParams.set('logs', '1')
    return parsed.toString()
  } catch {
    if (/[?&]logs=/.test(url)) return url
    return url.includes('?') ? `${url}&logs=1` : `${url}?logs=1`
  }
}
