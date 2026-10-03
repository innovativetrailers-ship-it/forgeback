import { GenerationPausedError, generationPausedFromEnv } from '../adapters/chokepoints'
import type { ShotError } from './errorNet'

/** The only fields a local model is allowed to see. */
export interface LocalTaskPayload {
  shotPrompt: string
  seed?: number
  referenceImages?: string[]
  duration?: number
  params?: Record<string, string | number | boolean>
}

const PAYLOAD_KEYS = new Set(['shotPrompt', 'seed', 'referenceImages', 'duration', 'params'])
const FORBIDDEN_PARAM = /^(system|systemprompt|script|breakdown|shots|othershots|dag|reasoning|moe|userid|email|falkey|apikey|token|authorization|secret|password|session|billing|entitlement|orchestrator)$/i
const MAX_HTTP_URL = 8_000
const MAX_MEDIA_BLOB = 1_500_000
const MAX_PARAM_TEXT = 500
const MAX_REFS = 8

export class LocalModelRefusal extends Error {
  readonly shotError: ShotError

  constructor(message: string, endpoint: string) {
    super(message)
    this.name = 'LocalModelRefusal'
    this.shotError = {
      model: 'local',
      endpoint,
      stage: 'completion',
      rawError: message,
      timestamp: new Date().toISOString(),
    }
  }
}

function mediaUrl(value: string, max: number): boolean {
  if (value.length > max) return false
  if (value.startsWith('data:image/') || value.startsWith('data:video/')) return true
  try {
    const url = new URL(value)
    if (url.username || url.password) return false
    return url.protocol === 'https:' || url.protocol === 'http:'
  } catch {
    return false
  }
}

/** Whitelist builder. Unknown fields are dropped, including system text and other shots. */
export function buildLocalTaskPayload(input: Record<string, unknown>): LocalTaskPayload {
  const shotPrompt = typeof input.shotPrompt === 'string'
    ? input.shotPrompt
    : typeof input.prompt === 'string' ? input.prompt : ''
  if (!shotPrompt.trim()) throw new LocalModelRefusal('A local model needs the shot prompt only', 'local')
  const payload: LocalTaskPayload = { shotPrompt: shotPrompt.trim() }
  if (typeof input.seed === 'number' && Number.isFinite(input.seed)) payload.seed = input.seed
  if (typeof input.duration === 'number' && input.duration > 0 && input.duration <= 60) payload.duration = input.duration
  if (Array.isArray(input.referenceImages)) {
    const images = input.referenceImages
      .filter((item): item is string => typeof item === 'string' && mediaUrl(item, MAX_MEDIA_BLOB))
      .slice(0, MAX_REFS)
    if (images.length) payload.referenceImages = images
  }
  if (input.params && typeof input.params === 'object' && !Array.isArray(input.params)) {
    const params: Record<string, string | number | boolean> = {}
    for (const [key, value] of Object.entries(input.params as Record<string, unknown>)) {
      if (FORBIDDEN_PARAM.test(key)) continue
      if (typeof value === 'boolean' || (typeof value === 'number' && Number.isFinite(value))) params[key] = value
      else if (typeof value === 'string' && value.length <= MAX_PARAM_TEXT) params[key] = value
    }
    if (Object.keys(params).length) payload.params = params
  }
  return payload
}

export function assertLocalPayloadClosed(payload: LocalTaskPayload): void {
  for (const key of Object.keys(payload)) {
    if (!PAYLOAD_KEYS.has(key)) throw new LocalModelRefusal(`Local payload refused an extra field: ${key}`, 'local')
  }
}

/** Localhost, or an origin the user typed. No userinfo, no Forge credentials. */
export function assertLocalEndpoint(endpoint: string, allow: readonly string[] = []): URL {
  let url: URL
  try {
    url = new URL(endpoint)
  } catch {
    throw new LocalModelRefusal('Local endpoint is not a URL', endpoint)
  }
  if (url.username || url.password) throw new LocalModelRefusal('A local endpoint cannot carry credentials', endpoint)
  const host = url.hostname
  const local = host === 'localhost' || host === '127.0.0.1' || host === '::1'
  const listed = allow.some((item) => {
    try { return new URL(item).origin === url.origin } catch { return false }
  })
  if (!local && !listed) throw new LocalModelRefusal('Local models only run on localhost or an allow-listed endpoint', endpoint)
  return url
}

export function localRequestHeaders(): Record<string, string> {
  return { 'content-type': 'application/json', accept: 'application/json' }
}

/** ComfyUI workflow JSON is data. Slot text is substituted. Nothing is executed. */
export function injectWorkflowSlots(workflow: unknown, shotPrompt: string): unknown {
  if (typeof workflow === 'string') {
    let parsed: unknown
    try {
      parsed = JSON.parse(workflow) as unknown
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Workflow JSON is not data'
      throw new LocalModelRefusal(message, 'local')
    }
    return injectWorkflowSlots(parsed, shotPrompt)
  }
  if (Array.isArray(workflow)) return workflow.map((item) => injectWorkflowSlots(item, shotPrompt))
  if (!workflow || typeof workflow !== 'object') return workflow
  const next: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(workflow)) {
    next[key] = typeof value === 'string' ? value.replaceAll('{{PROMPT}}', shotPrompt) : injectWorkflowSlots(value, shotPrompt)
  }
  return next
}

/** A return is a media URL or it is rejected. It is never treated as code. */
export function validateLocalResult(value: unknown, endpoint = 'local'): { mediaUrl: string } {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new LocalModelRefusal('Local model returned a non-media payload', endpoint)
  }
  const row = value as { url?: unknown; video?: { url?: unknown }; image?: { url?: unknown }; error?: unknown }
  if (typeof row.error === 'string' && row.error.trim()) {
    throw new LocalModelRefusal(row.error.trim().slice(0, 400), endpoint)
  }
  const media = [row.url, row.video?.url, row.image?.url].find((item) => typeof item === 'string') as string | undefined
  if (!media) throw new LocalModelRefusal('Local model returned a non-media payload', endpoint)
  const cap = media.startsWith('data:') ? MAX_MEDIA_BLOB : MAX_HTTP_URL
  if (!mediaUrl(media, cap)) throw new LocalModelRefusal('Local model returned a non-media payload', endpoint)
  return { mediaUrl: media }
}

export interface LocalSubmitInput {
  endpoint: string
  allow?: readonly string[]
  task: Record<string, unknown>
  workflow?: unknown
  pausedEnv?: string
  enabledEnv?: string
}

/** Posts the whitelist only. Records a zero-cost local call. Does not send Forge credentials. */
export async function submitLocalTask(input: LocalSubmitInput, fetchImpl: typeof fetch = fetch): Promise<{ mediaUrl: string }> {
  if (generationPausedFromEnv(input.pausedEnv ?? process.env.GENERATION_PAUSED)) {
    throw new GenerationPausedError('Blocked: GENERATION_PAUSED is ON. local model')
  }
  const enabled = (input.enabledEnv ?? process.env.LOCAL_MODELS_ENABLED ?? '').trim().toLowerCase()
  if (enabled !== 'true' && enabled !== '1' && enabled !== 'on') {
    throw new LocalModelRefusal('Local models stay off until LOCAL_MODELS_ENABLED is on', input.endpoint)
  }
  const url = assertLocalEndpoint(input.endpoint, input.allow ?? [])
  const task = buildLocalTaskPayload(input.task)
  assertLocalPayloadClosed(task)
  const body = input.workflow
    ? { task, workflow: injectWorkflowSlots(input.workflow, task.shotPrompt) }
    : task
  console.log('[local_call]', JSON.stringify({ costUsd: 0, endpoint: url.origin }))
  const res = await fetchImpl(url.toString(), {
    method: 'POST',
    headers: localRequestHeaders(),
    body: JSON.stringify(body),
  })
  let json: unknown
  try {
    json = await res.json()
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Local model returned a non-media payload'
    throw new LocalModelRefusal(message, url.origin)
  }
  if (!res.ok) {
    throw new LocalModelRefusal(`Local model returned HTTP ${res.status}`, url.origin)
  }
  return validateLocalResult(json, url.origin)
}
