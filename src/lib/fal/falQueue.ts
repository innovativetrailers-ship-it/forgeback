/**
 * FAL queue — submit + poll using the status_url and response_url FAL returns.
 * A missing or 404 result URL falls back to the base app id (first two path segments).
 */

import { falEndpoint } from '@cinema/core/endpoints'
import { guardedFalSubmit } from '@cinema/core'
import { extractFalLockFromError, formatFalBalanceError } from '@/lib/fal/accountStatus'
import { classifyFalError, FalValidationError, throwIfFalValidation } from '@/lib/fal/falErrors'
import { ensureKlingTier } from '@/lib/fal/klingEndpoints'
import { getFalKey } from '@/lib/config/keys'
import { appendProviderLogs, currentGen, patchGen } from '@/lib/diagnostics/correlation'
import { collectProviderLogs, urlWithProviderLogs } from '@cinema/core'

type LogLevel = 'info' | 'warn' | 'error'

export function falLog(
  level: LogLevel,
  event: string,
  fields: Record<string, unknown>,
): void {
  const ctx = currentGen()
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    service: 'fal',
    event,
    shotId: fields.shotId ?? ctx.shotId ?? null,
    falRequestId: fields.falRequestId ?? ctx.falRequestId ?? fields.requestId ?? null,
    model: fields.model ?? ctx.model ?? null,
    mode: fields.mode ?? ctx.mode ?? null,
    stage: fields.stage ?? ctx.stage ?? null,
    source: fields.source ?? ctx.source ?? null,
    ...fields,
  })
  if (level === 'error') console.error(entry)
  else if (level === 'warn') console.warn(entry)
  else console.log(entry)
}

export interface FalSubmission {
  requestId: string
  statusUrl: string
  responseUrl: string
  cancelUrl: string
  endpoint: string
  submittedAt?: number
  shotId?: string
  model?: string
  mode?: string
}

export interface FalResult {
  data: Record<string, unknown>
  requestId: string
  durationMs?: number
}

export type FalQueueStatus = 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED' | 'FAILED'

const STATUS_FETCH_MS = 15_000

function resultVideoUrl(data: unknown): string | undefined {
  if (!data || typeof data !== 'object') return undefined
  const d = data as Record<string, unknown>
  const video = d.video as { url?: string } | undefined
  if (typeof video?.url === 'string' && video.url.trim()) return video.url.trim()
  if (typeof d.video_url === 'string' && d.video_url.trim()) return d.video_url.trim()
  const output = d.output as { video?: { url?: string }; video_url?: string } | undefined
  if (typeof output?.video?.url === 'string' && output.video.url.trim()) return output.video.url.trim()
  if (typeof output?.video_url === 'string' && output.video_url.trim()) return output.video_url.trim()
  const payload = d.payload as { video?: { url?: string }; video_url?: string } | undefined
  if (typeof payload?.video?.url === 'string' && payload.video.url.trim()) return payload.video.url.trim()
  if (typeof payload?.video_url === 'string' && payload.video_url.trim()) return payload.video_url.trim()
  return undefined
}

function pollFields(submission: FalSubmission, jobId?: string) {
  const ctx = currentGen()
  return {
    endpoint: submission.endpoint,
    requestId: submission.requestId,
    falRequestId: submission.requestId,
    jobId: jobId ?? ctx.jobId ?? null,
    shotId: submission.shotId ?? ctx.shotId ?? null,
    model: submission.model ?? ctx.model ?? null,
    mode: submission.mode ?? ctx.mode ?? null,
    stage: 'poll' as const,
  }
}

function normalizeFalStatus(body: Record<string, unknown>): FalQueueStatus {
  if (resultVideoUrl(body)) return 'COMPLETED'
  const raw = String(body.status ?? body.request_status ?? '').trim().toUpperCase().replace(/-/g, '_')
  if (raw === 'COMPLETED' || raw === 'COMPLETE' || raw === 'OK' || raw === 'SUCCESS') return 'COMPLETED'
  if (raw === 'FAILED' || raw === 'ERROR' || raw === 'CANCELLED') return 'FAILED'
  if (raw === 'IN_PROGRESS' || raw === 'PROCESSING') return 'IN_PROGRESS'
  return 'IN_QUEUE'
}

async function captureFalQueueError(input: {
  err?: unknown
  rawError: string
  httpStatus?: number
  endpoint: string
  stage: 'submit' | 'poll' | 'completion'
  falRequestId?: string
  jobId?: string
  providerLogs?: string[]
  payloadSnapshot?: Record<string, unknown>
}): Promise<void> {
  try {
    const { captureGenerationError } = await import('@/lib/diagnostics/capture')
    const ctx = currentGen()
    await captureGenerationError({
      ...input,
      payloadSnapshot: input.payloadSnapshot ?? ctx.payloadSnapshot,
    })
  } catch (err) {
    const { noteCaptureFailure } = await import('@/lib/diagnostics/captureFallback')
    await noteCaptureFailure(err, input.rawError, 'captureFalQueueError')
  }
}

async function fetchFalJson(url: string): Promise<{ status: number; body: Record<string, unknown>; raw: string }> {
  const res = await fetch(urlWithProviderLogs(url), {
    headers: authHeaders(),
    signal: AbortSignal.timeout(STATUS_FETCH_MS),
  })
  const raw = await res.text().catch((err) => {
    console.warn("[caught] src/lib/fal/falQueue.ts:111", err instanceof Error ? { name: err.name, message: err.message } : err)
    return ('')
  })
  let body: Record<string, unknown> = {}
  try {
    const parsed = JSON.parse(raw || '{}') as unknown
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      body = parsed as Record<string, unknown>
    } else {
      body = { raw }
    }
  } catch (err) {
    console.warn("[caught] src/lib/fal/falQueue.ts:120", err instanceof Error ? { name: err.name, message: err.message } : err)

    body = { raw }
  }
  const logs = collectProviderLogs(body)
  if (logs.length) appendProviderLogs(logs)
  return { status: res.status, body, raw }
}

interface FalSubmitResponse {
  request_id?: string
  status_url?: string
  response_url?: string
  cancel_url?: string
}

/** falEndpoint('wan/v2.6/text-to-video') → falEndpoint('wan'). Result URLs use this, never the full subpath. */
export function falBaseAppId(endpoint: string): string {
  return endpoint.split('/').filter(Boolean).slice(0, 2).join('/')
}

export function falResultFallbackUrl(endpoint: string, requestId: string): string {
  return `https://queue.fal.run/${falBaseAppId(endpoint)}/requests/${requestId}`
}

function resultDetail(body: Record<string, unknown>, raw: string): string {
  const detail = body.detail ?? body.error ?? body
  if (typeof detail === 'string' && detail.trim()) return detail
  try {
    const text = JSON.stringify(detail)
    if (text && text !== '{}' && text !== 'null') return text
  } catch (err) {
    console.warn("[caught] src/lib/fal/falQueue.ts:150", err instanceof Error ? { name: err.name, message: err.message } : err)

    // fall through to the raw body
  }
  return raw.slice(0, 2000)
}

/**
 * Fetch the result body. Uses the submit response_url verbatim.
 * A 404 retries once against the base-app request URL.
 * A 422 throws FalValidationError with the JSON detail (not retried).
 */
async function fetchFalResultBody(
  submission: FalSubmission,
  jobId?: string,
): Promise<Record<string, unknown>> {
  const primary = submission.responseUrl
    || falResultFallbackUrl(submission.endpoint, submission.requestId)
  let used = primary
  let res = await fetchFalJson(primary)
  if (res.status === 404) {
    const fallback = falResultFallbackUrl(submission.endpoint, submission.requestId)
    falLog('error', 'fal_result_404', {
      jobId,
      endpoint: submission.endpoint,
      requestId: submission.requestId,
      falRequestId: submission.requestId,
      used,
      submitted: submission.responseUrl,
      fallback,
      stage: 'poll',
    })
    if (fallback !== primary) {
      used = fallback
      res = await fetchFalJson(fallback)
    }
  }
  if (res.status === 200) return res.body
  const detail = resultDetail(res.body, res.raw)
  falLog('error', 'fal_generation_error', {
    jobId,
    endpoint: submission.endpoint,
    requestId: submission.requestId,
    falRequestId: submission.requestId,
    httpStatus: res.status,
    detail,
    used,
    submitted: submission.responseUrl,
    stage: 'poll',
  })
  if (res.status === 422) {
    throw new FalValidationError(`${submission.endpoint}: ${detail}`, submission.endpoint)
  }
  if (res.status === 404) {
    throw new Error(`result 404 for ${submission.requestId}`)
  }
  throw new Error(`FAL result fetch failed (${res.status}) for ${submission.requestId}: ${detail}`)
}

const MAX_CONSECUTIVE_ERRORS = 3

/**
 * Global video-generation lock — one FAL video job at a time per process.
 * Probes and non-video endpoints bypass via withVideoGenLock({ bypassLock: true }).
 */
class GenerationSemaphore {
  private queue: Array<(release: () => void) => void> = []
  private locked = false

  async acquire(): Promise<() => void> {
    if (!this.locked) {
      this.locked = true
      return () => this._release()
    }
    return new Promise((resolve) => {
      this.queue.push((release) => resolve(release))
    })
  }

  private _release(): void {
    const next = this.queue.shift()
    if (next) {
      next(() => this._release())
    } else {
      this.locked = false
    }
  }

  get isLocked(): boolean {
    return this.locked
  }

  get queueDepth(): number {
    return this.queue.length
  }
}

const videoGenSemaphore = new GenerationSemaphore()

const LOG_EVERY_N_POLLS = 5

const PROMPTLESS_ENDPOINT_FRAGMENTS = [
  'upscale',
  'motion-brush',
  'reframe',
  'video-to-video',
  'background-removal',
  'ffmpeg',
  'extract-frame',
  'extract_last_frame',
  'whisper',
  'rembg',
  'trainer',
  'lora-fast-training',
  'sam-3',
  'voice-clone',
  'stable-audio-3-trainer',
]

const VIDEO_LOCK_SKIP_FRAGMENTS = [
  'gemini',
  'flux',
  'ffmpeg',
  'whisper',
  'instant',
  'codeformer',
  'face-swap',
  'stable-audio',
  'rife-interpolation',
  'dwpose',
  'extract-frame',
  'rembg',
  'sadtalker',
  'trainer',
  'lora-fast-training',
  'sam-3',
  'voice-clone',
]

export function isVideoGenerationEndpoint(endpoint: string): boolean {
  if (PROMPTLESS_ENDPOINT_FRAGMENTS.some((p) => endpoint.includes(p))) return false
  if (VIDEO_LOCK_SKIP_FRAGMENTS.some((p) => endpoint.includes(p))) return false
  const id = endpoint.toLowerCase()
  return (
    id.includes('text-to-video') ||
    id.includes('image-to-video') ||
    id.includes('/veo3') ||
    id.includes('kling-video') ||
    id.includes('seedance') ||
    id.includes('hunyuan-video') ||
    id.includes('luma-dream-machine') ||
    id.includes('pixverse') ||
    id.includes('hailuo') ||
    id.includes('pika/') ||
    id.includes('wan/v') ||
    id.includes('happy-horse')
  )
}

export async function withVideoGenLock<T>(
  fn: () => Promise<T>,
  options?: { bypassLock?: boolean; endpoint?: string; jobId?: string },
): Promise<T> {
  const endpoint = options?.endpoint ?? ''
  if (options?.bypassLock || !isVideoGenerationEndpoint(endpoint)) {
    return fn()
  }

  falLog('info', 'fal_queue_acquire', {
    endpoint,
    jobId: options?.jobId,
    semaphoreQ: videoGenSemaphore.queueDepth,
    locked: videoGenSemaphore.isLocked,
  })

  const release = await videoGenSemaphore.acquire()

  falLog('info', 'fal_queue_acquired', {
    endpoint,
    jobId: options?.jobId,
    queueDepth: videoGenSemaphore.queueDepth,
  })

  try {
    return await fn()
  } finally {
    release()
    falLog('info', 'fal_queue_released', {
      endpoint,
      jobId: options?.jobId,
      queueDepth: videoGenSemaphore.queueDepth,
    })
  }
}

const ENDPOINT_TIMEOUT_MS: Record<string, number> = {
  [falEndpoint('hunyuan-video')]:           600_000,
  [falEndpoint('veo3.1')]:                  420_000,
  [falEndpoint('veo3.1/fast')]:             420_000,
  [falEndpoint('veo3')]:                    420_000,
  'wan/v2.6/text-to-video':         300_000,
  'wan/v2.6/image-to-video':        300_000,
  [falEndpoint('ltx-2.3/text-to-video')]:   240_000,
  [falEndpoint('ltx-2.3/text-to-video/fast')]: 240_000,
  [falEndpoint('ltx-2.3/image-to-video')]: 240_000,
  [falEndpoint('gemini-25-flash-image')]:   120_000,
  [falEndpoint('gemini-3-pro-image-preview')]: 180_000,
  [falEndpoint('kling-video/v3/pro/text-to-video')]: 600_000,
  [falEndpoint('kling-video/v3/pro/image-to-video')]: 600_000,
  'bytedance/seedance-2.0/text-to-video': 600_000,
  'bytedance/seedance-2.0/image-to-video': 600_000,
}

const DEFAULT_ENDPOINT_TIMEOUT_MS = 300_000

export function getEndpointTimeout(endpoint: string): number {
  if (ENDPOINT_TIMEOUT_MS[endpoint]) return ENDPOINT_TIMEOUT_MS[endpoint]
  for (const [key, ms] of Object.entries(ENDPOINT_TIMEOUT_MS)) {
    if (endpoint.startsWith(key) || endpoint.includes(key)) return ms
  }
  return DEFAULT_ENDPOINT_TIMEOUT_MS
}

/** @deprecated Use getEndpointTimeout — keyed by FAL endpoint id. */
export function getModelTimeout(endpoint: string): number {
  return getEndpointTimeout(endpoint)
}

function assertGenerationPrompt(
  endpoint: string,
  input: Record<string, unknown>,
  jobId?: string,
): void {
  const isPromptless = PROMPTLESS_ENDPOINT_FRAGMENTS.some((p) => endpoint.includes(p))
  if (isPromptless) return

  const p = input.prompt as string | undefined
  const mp = input.multi_prompt as string[] | undefined
  const ps = input.prompts as string[] | undefined

  const hasPrompt =
    (p && p.trim().length >= 3) ||
    (mp && mp.some((x) => x?.trim().length >= 3)) ||
    (ps && ps.some((x) => x?.trim().length >= 3))

  if (!hasPrompt) {
    falLog('error', 'fal_submit_blocked', {
      endpoint,
      jobId,
      reason: 'no_prompt',
      promptValue: p ?? '(undefined)',
    })
    throw new Error(
      `[FAL] Refusing to submit to ${endpoint}: no usable prompt found ` +
      `(checked prompt / multi_prompt / prompts). Check shot plan → payload adapter chain.`,
    )
  }
}

function authHeaders(): Record<string, string> {
  return { Authorization: `Key ${getFalKey()}` }
}

export function serializeFalSubmission(submission: FalSubmission): string {
  return JSON.stringify(submission)
}

export function parseFalSubmission(raw: string): FalSubmission | null {
  try {
    const parsed = JSON.parse(raw) as FalSubmission
    if (parsed?.requestId && parsed?.statusUrl && parsed?.responseUrl && parsed?.endpoint) {
      return parsed
    }
    return null
  } catch (err) {
    console.warn("[caught] src/lib/fal/falQueue.ts:423", err instanceof Error ? { name: err.name, message: err.message } : err)

    return null
  }
}

/**
 * Submit to FAL queue and return all URLs from the response.
 */
export async function submitToFal(
  endpoint: string,
  input: Record<string, unknown>,
  source: string,
  jobId?: string,
  options?: { webhookUrl?: string },
): Promise<FalSubmission> {
  const { assertGenerationNotPaused } = await import('@/lib/generation/pause')
  assertGenerationNotPaused(endpoint)
  const routedEndpoint = ensureKlingTier(endpoint)
  if (routedEndpoint !== endpoint) {
    falLog('warn', 'payload_clamped', {
      endpoint: routedEndpoint,
      field: 'endpoint',
      from: endpoint,
      to: routedEndpoint,
      stage: 'submit',
    })
    endpoint = routedEndpoint
  }

  let caller: string
  try {
    const { requireCallerSource } = await import('@cinema/core')
    caller = requireCallerSource(source)
  } catch {
    throw new Error(`FAL submit with no caller source — refusing (endpoint=${endpoint})`)
  }

  const promptHead = String(input.prompt ?? '').slice(0, 50)

  assertGenerationPrompt(endpoint, input, jobId)

  const ctx = currentGen()
  let payload = input
  try {
    const { applyErrorCorrections } = await import('@/lib/diagnostics/correct')
    payload = await applyErrorCorrections(endpoint, input, ctx.model)
  } catch (err) {
    console.warn("[caught] src/lib/fal/falQueue.ts:470", err instanceof Error ? { name: err.name, message: err.message } : err)

    payload = input
  }

  try {
    const { snapshotPayload } = await import('@/lib/diagnostics/capture')
    patchGen({
      endpoint,
      source: caller,
      stage: 'submit',
      payloadSnapshot: snapshotPayload(payload),
    })
  } catch (err) {
    console.warn("[caught] src/lib/fal/falQueue.ts:482", err instanceof Error ? { name: err.name, message: err.message } : err)

    patchGen({ endpoint, source: caller, stage: 'submit' })
  }

  falLog('info', 'fal_submit_start', {
    endpoint,
    jobId: jobId ?? ctx.jobId,
    shotId: ctx.shotId,
    caller,
    source: caller,
    promptHead,
    prompt: (payload.prompt as string | undefined)?.slice(0, 100),
    duration: payload.duration,
    aspectRatio: payload.aspect_ratio ?? payload.aspectRatio,
    hasImage: !!(payload.image_url ?? payload.start_image_url ?? payload.video_url),
    semaphoreQ: videoGenSemaphore.queueDepth,
    stage: 'submit',
  })
  console.log('[fal_submit]', JSON.stringify({
    endpoint,
    source: caller,
    caller,
    model: ctx.model ?? null,
    mode: ctx.mode ?? null,
    stage: 'submit',
    shotId: ctx.shotId ?? null,
    falRequestId: ctx.falRequestId ?? null,
    promptHead,
    jobId: jobId ?? ctx.jobId,
  }))

  let res: FalSubmitResponse
  try {
    const submitted = await guardedFalSubmit({
      endpoint,
      input: payload,
      source: caller,
      falKey: getFalKey(),
      pausedEnv: process.env.GENERATION_PAUSED,
      webhookUrl: options?.webhookUrl,
    })
    res = {
      request_id: submitted.requestId,
      status_url: submitted.statusUrl,
      response_url: submitted.responseUrl,
      cancel_url: submitted.cancelUrl,
    }
  } catch (err) {
    const lock = extractFalLockFromError(err)
    try {
      const { extractFullError, snapshotPayload } = await import('@/lib/diagnostics/capture')
      const full = extractFullError(err)
      await captureFalQueueError({
        err,
        rawError: full.raw,
        httpStatus: full.httpStatus,
        endpoint,
        stage: 'submit',
        jobId: jobId ?? ctx.jobId,
        payloadSnapshot: snapshotPayload(payload),
        providerLogs: full.logs,
      })
    } catch (captureErr) {
      // Capture is additive. The submit error is still classified and rethrown below.
      falLog('warn', 'fal_capture_failed', {
        jobId: jobId ?? ctx.jobId,
        endpoint,
        err: captureErr instanceof Error
          ? { name: captureErr.name, message: captureErr.message }
          : String(captureErr),
      })
    }
    if (lock) throw new Error(formatFalBalanceError(lock) + ` (${endpoint})`)
    const classified = classifyFalError(err, endpoint)
    if (!(classified instanceof FalValidationError)) {
      falLog('error', 'fal_submit_failed', {
        endpoint,
        jobId: jobId ?? ctx.jobId,
        shotId: ctx.shotId,
        error: classified.message,
        stage: 'submit',
      })
    }
    throw classified
  }

  const requestId = res.request_id
  const statusUrl = res.status_url
  const responseUrl = res.response_url
  patchGen({ falRequestId: requestId, endpoint, stage: 'submit' })

  if (!requestId || !statusUrl || !responseUrl) {
    falLog('error', 'fal_submit_incomplete', {
      endpoint,
      jobId,
      response: JSON.stringify(res).slice(0, 200),
    })
    throw new Error(
      `FAL submit to ${endpoint} returned incomplete submission: ${JSON.stringify(res)}`,
    )
  }

  falLog('info', 'fal_submit_ok', {
    endpoint,
    jobId: jobId ?? ctx.jobId,
    shotId: ctx.shotId,
    model: ctx.model,
    mode: ctx.mode,
    requestId,
    falRequestId: requestId,
    statusUrl,
    responseUrl,
    semaphoreQ: videoGenSemaphore.queueDepth,
    stage: 'submit',
    source: caller,
  })

  return {
    requestId,
    statusUrl,
    responseUrl,
    cancelUrl: res.cancel_url ?? '',
    endpoint,
    submittedAt: Date.now(),
    shotId: ctx.shotId,
    model: ctx.model,
    mode: ctx.mode,
  }
}

/**
 * Single status poll tick — for BullMQ worker loops.
 */
export async function pollFalStatusOnce(
  submission: FalSubmission,
): Promise<{ status: FalQueueStatus; data?: unknown; error?: string }> {
  let res: { status: number; body: Record<string, unknown>; raw: string }
  try {
    res = await fetchFalJson(submission.statusUrl)
  } catch (err) {
    console.warn("[caught] src/lib/fal/falQueue.ts:606", err instanceof Error ? { name: err.name, message: err.message } : err)

    const ready = await readReadyResult(submission)
    if (ready) return { status: 'COMPLETED', data: ready }
    return {
      status: 'IN_QUEUE',
      error: err instanceof Error ? err.message : String(err),
    }
  }

  if (res.status === 404 || res.status === 410) {
    const ready = await readReadyResult(submission)
    if (ready) return { status: 'COMPLETED', data: ready }
    const bodyText = res.raw || JSON.stringify(res.body)
    const error = res.status === 410
      ? `FAL endpoint ${submission.endpoint} is deprecated (410): ${bodyText}`
      : `FAL status URL returned 404 for request ${submission.requestId} ` +
        `on ${submission.endpoint}: ${bodyText}`
    await captureFalQueueError({
      rawError: error,
      httpStatus: res.status,
      endpoint: submission.endpoint,
      stage: 'poll',
      falRequestId: submission.requestId,
      providerLogs: collectProviderLogs(res.body),
    })
    return { status: 'FAILED', error }
  }

  const onceStatus = String(res.body.status ?? '').trim().toUpperCase().replace(/-/g, '_')
  const onceTerminal = onceStatus === 'FAILED' || onceStatus === 'ERROR' || onceStatus === 'CANCELLED'
  if (onceTerminal) {
    const detail = typeof res.body.error === 'string' ? res.body.error : JSON.stringify(res.body)
    return { status: 'FAILED', error: `FAL generation failed: ${detail}` }
  }
  if (res.status === 202 || onceStatus === 'IN_QUEUE' || onceStatus === 'IN_PROGRESS' || onceStatus === 'PROCESSING') {
    return { status: onceStatus === 'IN_PROGRESS' || onceStatus === 'PROCESSING' ? 'IN_PROGRESS' : 'IN_QUEUE' }
  }

  if (res.status !== 200) {
    const ready = await readReadyResult(submission)
    if (ready) return { status: 'COMPLETED', data: ready }
    const bodyText = res.raw || JSON.stringify(res.body)
    return {
      status: 'IN_QUEUE',
      error: `FAL status check failed (HTTP ${res.status}) for ${submission.requestId}: ${bodyText}`,
    }
  }

  const body = res.body
  let status = normalizeFalStatus(body)
  let data: Record<string, unknown> = body

  if (status !== 'COMPLETED' && status !== 'FAILED') {
    const ready = await readReadyResult(submission)
    if (ready) {
      status = 'COMPLETED'
      data = ready
    }
  }

  if (status === 'COMPLETED') {
    if (!resultVideoUrl(data)) {
      try {
        data = await fetchFalResultBody(submission)
      } catch (err) {
        if (err instanceof FalValidationError) throw err
        const message = err instanceof Error ? err.message : String(err)
        if (message.startsWith('result 404') || message.includes('(422)')) {
          return { status: 'FAILED', error: message }
        }
        return { status: 'IN_QUEUE', error: message }
      }
      try {
        throwIfFalValidation(data.detail ?? data.error ?? data, submission.endpoint)
      } catch (err) {
        await captureFalQueueError({
          err,
          rawError: err instanceof Error ? err.message : String(err),
          endpoint: submission.endpoint,
          stage: 'poll',
          falRequestId: submission.requestId,
          providerLogs: collectProviderLogs(data),
        })
        throw err
      }
    }
    const detail = data.detail
    if (detail === 'Not Found' || data.error) {
      const error = String(data.error ?? detail ?? 'FAL result error')
      await captureFalQueueError({
        rawError: error,
        endpoint: submission.endpoint,
        stage: 'poll',
        falRequestId: submission.requestId,
        providerLogs: collectProviderLogs(data),
      })
      return {
        status: 'FAILED',
        error,
      }
    }
    return { status: 'COMPLETED', data }
  }

  if (status === 'FAILED') {
    const detail = (body.error as string) ?? JSON.stringify(body)
    const logs = collectProviderLogs(body)
    if (logs.length) appendProviderLogs(logs)
    await captureFalQueueError({
      rawError: detail,
      endpoint: submission.endpoint,
      stage: 'poll',
      falRequestId: submission.requestId,
      providerLogs: logs,
    })
    throwIfFalValidation(detail, submission.endpoint)
    return { status: 'FAILED', error: `FAL generation failed: ${detail}` }
  }

  if (status === 'IN_PROGRESS') return { status: 'IN_PROGRESS' }
  return { status: 'IN_QUEUE' }
}

async function readReadyResult(submission: FalSubmission): Promise<Record<string, unknown> | null> {
  try {
    const resultRes = await fetchFalJson(submission.responseUrl)
    if (resultRes.status === 422) {
      const detail = resultDetail(resultRes.body, resultRes.raw)
      falLog('error', 'fal_generation_error', {
        endpoint: submission.endpoint,
        requestId: submission.requestId,
        falRequestId: submission.requestId,
        httpStatus: 422,
        detail,
        used: submission.responseUrl,
        submitted: submission.responseUrl,
        stage: 'poll',
      })
      throw new FalValidationError(`${submission.endpoint}: ${detail}`, submission.endpoint)
    }
    if (resultRes.status !== 200) return null
    if (!resultVideoUrl(resultRes.body)) return null
    return resultRes.body
  } catch (err) {
    if (err instanceof FalValidationError) throw err
    return null
  }
}

/**
 * Poll until complete using FAL-provided status/response URLs.
 */
export async function pollFalResult(
  submission: FalSubmission,
  options?: {
    timeoutMs?: number
    pollIntervalMs?: number
    onProgress?: (pct: number, logs?: string, queuePosition?: number | string, status?: FalQueueStatus) => void
    jobHeartbeat?: () => void | Promise<void>
    jobId?: string
  },
): Promise<FalResult> {
  const timeout = options?.timeoutMs ?? 600_000
  const interval = options?.pollIntervalMs ?? 3_000
  const deadline = Date.now() + timeout
  const jobId = options?.jobId
  const submittedAt = submission.submittedAt ?? Date.now()
  let consecutiveErrors = 0
  let pollCount = 0

  falLog('info', 'fal_poll_start', {
    endpoint: submission.endpoint,
    requestId: submission.requestId,
    falRequestId: submission.requestId,
    jobId,
    timeoutMs: timeout,
    stage: 'poll',
  })
  patchGen({ falRequestId: submission.requestId, endpoint: submission.endpoint, stage: 'poll' })

  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, interval))
    pollCount++
    await options?.jobHeartbeat?.()

    let statusBody: Record<string, unknown>
    let status: FalQueueStatus
    try {
      const res = await fetchFalJson(submission.statusUrl)

      if (res.status === 404) {
        const bodyText = res.raw || JSON.stringify(res.body)
        falLog('error', 'fal_status_404', {
          endpoint: submission.endpoint,
          requestId: submission.requestId,
          jobId,
          httpStatus: 404,
          detail: bodyText.slice(0, 400),
          stage: 'poll',
        })
        const error = `FAL status URL returned 404 for request ${submission.requestId} ` +
          `on ${submission.endpoint}: ${bodyText}`
        await captureFalQueueError({
          rawError: error,
          httpStatus: 404,
          endpoint: submission.endpoint,
          stage: 'poll',
          falRequestId: submission.requestId,
          jobId,
          providerLogs: collectProviderLogs(res.body),
        })
        throw new Error(error)
      }

      if (res.status === 410) {
        const bodyText = res.raw || JSON.stringify(res.body)
        falLog('error', 'fal_endpoint_deprecated', {
          endpoint: submission.endpoint,
          requestId: submission.requestId,
          jobId,
          httpStatus: 410,
          stage: 'poll',
        })
        const error = `FAL endpoint ${submission.endpoint} is deprecated (410): ${bodyText}`
        await captureFalQueueError({
          rawError: error,
          httpStatus: 410,
          endpoint: submission.endpoint,
          stage: 'poll',
          falRequestId: submission.requestId,
          jobId,
          providerLogs: collectProviderLogs(res.body),
        })
        throw new Error(error)
      }

      const providerStatus = String(res.body.status ?? '').trim().toUpperCase().replace(/-/g, '_')
      const terminalStatus = providerStatus === 'FAILED' || providerStatus === 'ERROR' || providerStatus === 'CANCELLED'
      // 202 is FAL's in-progress heartbeat. It must not count as a failed poll.
      const inProgress = !terminalStatus && (
        res.status === 202
        || (res.status === 200 && (providerStatus === 'IN_QUEUE' || providerStatus === 'IN_PROGRESS' || providerStatus === 'PROCESSING'))
      )

      if (terminalStatus) {
        consecutiveErrors = 0
        statusBody = res.body
        status = 'FAILED'
      } else if (inProgress) {
        consecutiveErrors = 0
        statusBody = res.body
        status = normalizeFalStatus(res.body)
        falLog('info', 'fal_poll_progress', {
          ...pollFields(submission, jobId),
          httpStatus: res.status,
          status,
          pollCount,
        })
      } else if (res.status !== 200) {
        consecutiveErrors++
        falLog('warn', 'fal_status_error', {
          ...pollFields(submission, jobId),
          httpStatus: res.status,
          consecutive: consecutiveErrors,
        })
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
          const bodyText = res.raw || JSON.stringify(res.body)
          const error =
            `FAL status check failed ${MAX_CONSECUTIVE_ERRORS} times ` +
            `(HTTP ${res.status}) for ${submission.requestId}: ${bodyText}`
          await captureFalQueueError({
            rawError: error,
            httpStatus: res.status,
            endpoint: submission.endpoint,
            stage: 'poll',
            falRequestId: submission.requestId,
            jobId,
            providerLogs: collectProviderLogs(res.body),
          })
          throw new Error(error)
        }
        continue
      } else {
        consecutiveErrors = 0
        statusBody = res.body
        status = normalizeFalStatus(statusBody)
        if (status !== 'COMPLETED' && status !== 'FAILED') {
          const ready = await readReadyResult(submission)
          if (ready) {
            statusBody = ready
            status = 'COMPLETED'
          }
        }
      }
    } catch (err) {
      if (err instanceof Error && (
        err.message.includes('404') ||
        err.message.includes('deprecated') ||
        err.message.includes('consecutive')
      )) {
        throw err
      }
      consecutiveErrors++
      if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) throw err
      continue
    }

    const pct = status === 'COMPLETED'
      ? 100
      : (statusBody.progress as number | undefined) ?? (status === 'IN_PROGRESS' ? 0.5 : 0)
    const queuePosition = statusBody.queue_position as number | undefined
    const logs = statusBody.logs as Array<{ message?: string }> | undefined
    const lastLog = logs?.slice(-1)[0]?.message
    options?.onProgress?.(pct, lastLog, typeof queuePosition === 'number' ? queuePosition : undefined, status)

    if (
      pollCount % LOG_EVERY_N_POLLS === 0 ||
      status === 'COMPLETED' ||
      status === 'FAILED'
    ) {
      falLog('info', 'fal_poll_tick', {
        endpoint: submission.endpoint,
        requestId: submission.requestId,
        jobId,
        status,
        queue_position: queuePosition ?? 'n/a',
        pct: Math.round(pct * 100),
        elapsedMs: Date.now() - submittedAt,
        pollCount,
        lastLog: lastLog?.slice(0, 80),
      })
    }

    if (status === 'COMPLETED') {
      let data = statusBody
      if (!resultVideoUrl(data)) {
        try {
          data = await fetchFalResultBody(submission, jobId)
        } catch (err) {
          const message = err instanceof Error ? err.message : String(err)
          await captureFalQueueError({
            err,
            rawError: message,
            httpStatus: err instanceof FalValidationError ? 422 : undefined,
            endpoint: submission.endpoint,
            stage: 'poll',
            falRequestId: submission.requestId,
            jobId,
          })
          throw err
        }
      }
      try {
        throwIfFalValidation(data.detail ?? data.error ?? data, submission.endpoint)
      } catch (err) {
        await captureFalQueueError({
          err,
          rawError: err instanceof Error ? err.message : String(err),
          endpoint: submission.endpoint,
          stage: 'poll',
          falRequestId: submission.requestId,
          jobId,
          providerLogs: collectProviderLogs(data),
        })
        throw err
      }

      const durationMs = Date.now() - submittedAt

      falLog('info', 'fal_complete', {
        endpoint: submission.endpoint,
        requestId: submission.requestId,
        jobId,
        durationMs,
        durationSec: (durationMs / 1000).toFixed(1),
        hasVideo: Boolean(resultVideoUrl(data)),
        hasImages: Array.isArray(data?.images) && data.images.length > 0,
        pollCount,
      })

      return { data, requestId: submission.requestId, durationMs }
    }

    if (status === 'FAILED') {
      const detail = (statusBody.error as string)
        ?? (typeof statusBody.detail === 'string' ? statusBody.detail : JSON.stringify(statusBody))
      const logs = collectProviderLogs(statusBody)
      if (logs.length) appendProviderLogs(logs)
      falLog('error', 'fal_generation_failed', {
        endpoint: submission.endpoint,
        requestId: submission.requestId,
        jobId,
        detail: detail.slice(0, 200),
        elapsedMs: Date.now() - submittedAt,
        pollCount,
        stage: 'poll',
      })
      await captureFalQueueError({
        rawError: detail,
        endpoint: submission.endpoint,
        falRequestId: submission.requestId,
        stage: 'poll',
        jobId,
        providerLogs: logs,
      })
      throwIfFalValidation(detail, submission.endpoint)
      throw new Error(`FAL generation failed: ${detail}`)
    }
  }

  falLog('error', 'fal_timeout', {
    endpoint: submission.endpoint,
    requestId: submission.requestId,
    jobId,
    timeoutMs: timeout,
    elapsedMs: Date.now() - submittedAt,
    pollCount,
    stage: 'poll',
  })
  const timeoutError =
    `FAL generation timed out after ${timeout / 1000}s ` +
    `(request ${submission.requestId} on ${submission.endpoint})`
  await captureFalQueueError({
    rawError: timeoutError,
    httpStatus: 408,
    endpoint: submission.endpoint,
    stage: 'poll',
    falRequestId: submission.requestId,
    jobId,
  })
  throw new Error(timeoutError)
}

/** Endpoint existence is the free OpenAPI document. The queue POST was a billable submit. */
export async function billableFalQueueProbe(endpoint: string, _falKey: string): Promise<Response> {
  const { assertGenerationNotPaused } = await import('@/lib/generation/pause')
  assertGenerationNotPaused(endpoint)
  const { requireCallerSource } = await import('@cinema/core')
  requireCallerSource('fal.probe')
  return fetch(
    `https://fal.ai/api/openapi/queue/openapi.json?endpoint_id=${encodeURIComponent(endpoint)}`,
  )
}

/** Submit + poll in one call. */
export async function runFalQueue(
  endpoint: string,
  input: Record<string, unknown>,
  options?: Parameters<typeof pollFalResult>[1],
): Promise<FalResult> {
  const submission = await submitToFal(endpoint, input, 'fal:runFalQueue')
  return pollFalResult(submission, options)
}
