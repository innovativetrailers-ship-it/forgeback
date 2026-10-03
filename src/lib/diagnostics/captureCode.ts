import { normalizeErrorSignature } from '@cinema/core'
import { db } from '@/lib/db'
import { currentGen, genLog } from './correlation'
import { extractFullError } from './capture'
import { noteCaptureFailure } from './captureFallback'

const CODE_MESSAGE = 'A code error crashed this path. The technical details are saved.'

export async function captureCodeError(input: {
  err?: unknown
  rawError?: string
  shotId?: string
  userId?: string
  jobId?: string
  source?: string
}): Promise<string | null> {
  const ctx = currentGen()
  const extracted = input.err != null ? extractFullError(input.err) : { raw: '', logs: [] as string[] }
  const rawError = (input.rawError?.trim() || extracted.raw).trim()
  if (!rawError) return null
  const signature = normalizeErrorSignature(rawError)
  const recent = await db.shotError.findFirst({
    where: {
      category: 'code_error',
      signature,
      createdAt: { gte: new Date(Date.now() - 15_000) },
    },
    select: { id: true },
  }).catch((err) => {
    console.warn("[caught] src/lib/diagnostics/captureCode.ts:29", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (null)
  })
  if (recent) return recent.id

  genLog('error', 'code_error', {
    shotId: input.shotId ?? ctx.shotId,
    source: input.source ?? 'runtime',
  })

  const row = await db.shotError.create({
    data: {
      shotId: input.shotId ?? ctx.shotId ?? null,
      userId: input.userId ?? ctx.userId ?? null,
      jobId: input.jobId ?? ctx.jobId ?? null,
      model: ctx.model ?? 'runtime',
      mode: ctx.mode ?? null,
      purpose: ctx.purpose ?? null,
      endpoint: input.source ?? ctx.endpoint ?? 'runtime',
      stage: 'runtime',
      rawError,
      providerLogs: extracted.logs,
      signature,
      userMessage: CODE_MESSAGE,
      suggestedAction: 'retry',
      category: 'code_error',
      correctable: false,
      interpretedBy: 'code-net',
    },
    select: { id: true },
  }).catch((err) => {
    void noteCaptureFailure(err, rawError, 'captureCodeError')
    return null
  })
  return row?.id ?? null
}

export async function codeErrorStats(sinceHours = 24) {
  const since = new Date(Date.now() - sinceHours * 60 * 60 * 1000)
  const [total, recent] = await Promise.all([
    db.shotError.count({ where: { category: 'code_error' } }),
    db.shotError.count({ where: { category: 'code_error', createdAt: { gte: since } } }),
  ])
  return { total, lastHours: sinceHours, recent }
}
