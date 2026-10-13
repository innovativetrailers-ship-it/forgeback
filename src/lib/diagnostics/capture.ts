import {
  collectProviderLogs,
  normalizeErrorSignature,
  providerBodyText,
  type ErrorStage,
} from '@cinema/core'
import { db } from '@/lib/db'
import { appendProviderLogs, currentGen, genLog, patchGen } from './correlation'
import { interpretShotError } from './interpret'
import { noteCaptureFailure } from './captureFallback'

export interface CaptureInput {
  err?: unknown
  rawError?: string
  httpStatus?: number
  shotId?: string
  userId?: string
  jobId?: string
  model?: string
  mode?: string
  purpose?: string
  endpoint?: string
  stage: ErrorStage
  falRequestId?: string
  payloadSnapshot?: Record<string, unknown>
  providerLogs?: string[]
}

function httpStatusFrom(err: unknown): number | undefined {
  if (!err || typeof err !== 'object') return undefined
  const row = err as { status?: unknown; statusCode?: unknown; httpStatus?: unknown }
  const n = row.status ?? row.statusCode ?? row.httpStatus
  return typeof n === 'number' && Number.isFinite(n) ? n : undefined
}

export function extractFullError(err: unknown): { raw: string; httpStatus?: number; logs: string[] } {
  if (err == null) return { raw: 'unknown error', logs: [] }
  if (typeof err === 'string') return { raw: err, logs: [] }
  const httpStatus = httpStatusFrom(err)
  if (typeof err === 'object') {
    const row = err as {
      body?: unknown
      data?: unknown
      message?: unknown
      stack?: unknown
    }
    const bodyText = providerBodyText(row.body ?? row.data)
    const logs = [
      ...collectProviderLogs(row.body),
      ...collectProviderLogs(row.data),
    ]
    const message = typeof row.message === 'string' ? row.message : ''
    const stack = typeof row.stack === 'string' ? row.stack : ''
    const raw = [bodyText, message, stack].filter(Boolean).join('\n')
    return { raw: raw || JSON.stringify(err), httpStatus, logs }
  }
  return { raw: String(err), httpStatus, logs: [] }
}

export function snapshotPayload(input: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(input)) {
    if (typeof value === 'string') {
      out[key] = value.length > 20_000 ? `${value.slice(0, 20_000)}…` : value
    } else if (Array.isArray(value)) {
      out[key] = value.slice(0, 20).map((item) => {
        if (typeof item === 'string' && item.length > 500) return `${item.slice(0, 500)}…`
        return item
      })
    } else {
      out[key] = value
    }
  }
  return out
}

export async function captureGenerationError(input: CaptureInput): Promise<string | null> {
  try {
    return await writeGenerationError(input)
  } catch (err) {
    await noteCaptureFailure(err, input.rawError ?? '', 'captureGenerationError')
    return null
  }
}

async function writeGenerationError(input: CaptureInput): Promise<string | null> {
  const ctx = currentGen()
  const extracted = input.err != null ? extractFullError(input.err) : { raw: '', httpStatus: undefined, logs: [] }
  const rawError = (input.rawError?.trim() || extracted.raw).trim()
  if (!rawError) return null
  const logs = [...(input.providerLogs ?? []), ...(ctx.providerLogs ?? []), ...extracted.logs]
  if (logs.length) appendProviderLogs(logs)

  const shotId = input.shotId ?? ctx.shotId
  const userId = input.userId ?? ctx.userId
  const jobId = input.jobId ?? ctx.jobId
  const model = input.model ?? ctx.model ?? 'unknown'
  const endpoint = input.endpoint ?? ctx.endpoint ?? 'unknown'
  const falRequestId = input.falRequestId ?? ctx.falRequestId
  const httpStatus = input.httpStatus ?? extracted.httpStatus
  const signature = normalizeErrorSignature(rawError)

  if (shotId) {
    const recent = await db.shotError.findFirst({
      where: { shotId, createdAt: { gte: new Date(Date.now() - 15_000) } },
      select: { id: true },
    }).catch((err) => {
      console.warn("[caught] src/lib/diagnostics/capture.ts:107", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (null)
    })
    if (recent) return recent.id
  }

  const { interpreted, interpretedBy } = await interpretShotError(rawError, httpStatus)

  genLog('error', 'shot_error', {
    shotId,
    falRequestId,
    model,
    mode: input.mode ?? ctx.mode,
    stage: input.stage,
    endpoint,
    category: interpreted.category,
    httpStatus,
  })

  const row = await db.shotError.create({
    data: {
      shotId: shotId ?? null,
      userId: userId ?? null,
      jobId: jobId ?? null,
      model,
      mode: input.mode ?? ctx.mode ?? null,
      purpose: input.purpose ?? ctx.purpose ?? null,
      endpoint,
      stage: input.stage,
      httpStatus: httpStatus ?? null,
      falRequestId: falRequestId ?? null,
      rawError,
      providerLogs: logs,
      payloadSnapshot: input.payloadSnapshot
        ? JSON.parse(JSON.stringify(input.payloadSnapshot))
        : undefined,
      signature,
      userMessage: interpreted.userMessage,
      suggestedAction: interpreted.suggestedAction,
      category: interpreted.category,
      correctable: interpreted.correctable,
      correction: interpreted.correction ?? null,
      interpretedBy,
    },
    select: { id: true },
  })

  if (userId && model !== 'unknown') {
    await db.modelErrorTally.upsert({
      where: { userId_model_category: { userId, model, category: interpreted.category } },
      create: { userId, model, category: interpreted.category, total: 1 },
      update: { total: { increment: 1 } },
    }).catch((err) => noteCaptureFailure(err, rawError, 'modelErrorTally'))
  }

  if (interpreted.category === 'namespace_bad' || interpreted.category === 'field_mismatch') {
    const { flagEndpointForReverify } = await import('./replay')
    await flagEndpointForReverify(endpoint).catch((err) => noteCaptureFailure(err, rawError, 'flagEndpointForReverify'))
  }

  patchGen({ stage: input.stage })
  return row.id
}
