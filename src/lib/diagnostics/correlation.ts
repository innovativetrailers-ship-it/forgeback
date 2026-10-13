import { AsyncLocalStorage } from 'node:async_hooks'
import type { ErrorStage } from '@cinema/core'

export interface GenCorrelation {
  shotId?: string
  jobId?: string
  userId?: string
  falRequestId?: string
  model?: string
  mode?: string
  purpose?: string
  endpoint?: string
  source?: string
  stage?: ErrorStage
  providerLogs?: string[]
  payloadSnapshot?: Record<string, unknown>
}

const store = new AsyncLocalStorage<GenCorrelation>()

export function withGenContext<T>(ctx: GenCorrelation, fn: () => T): T {
  return store.run({ ...ctx, providerLogs: ctx.providerLogs ?? [] }, fn)
}

export function currentGen(): GenCorrelation {
  return store.getStore() ?? {}
}

export function patchGen(patch: Partial<GenCorrelation>): void {
  const now = store.getStore()
  if (!now) return
  Object.assign(now, patch)
}

export function appendProviderLogs(lines: string[]): void {
  const now = store.getStore()
  if (!now || !lines.length) return
  now.providerLogs = [...(now.providerLogs ?? []), ...lines]
}

export function genLog(
  level: 'info' | 'warn' | 'error',
  event: string,
  fields: Record<string, unknown> = {},
): void {
  const ctx = currentGen()
  const entry = JSON.stringify({
    ts: new Date().toISOString(),
    event,
    shotId: fields.shotId ?? ctx.shotId ?? null,
    falRequestId: fields.falRequestId ?? ctx.falRequestId ?? null,
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
