/**
 * fal.ai account health — zero-cost queue probes before paid orchestration.
 */

import { falEndpoint } from '@cinema/core/endpoints'
import { getFalKey } from '@/lib/config/keys'
import { isFalLockDetail, probeEndpoint, type ProbeResult } from '@/lib/fal/probeEndpoint'

export class FalAccountLockedError extends Error {
  readonly dashboardUrl = 'https://fal.ai/dashboard/billing'
  readonly lockedEndpoints: string[]

  constructor(detail: string, lockedEndpoints: string[] = []) {
    super(detail)
    this.name = 'FalAccountLockedError'
    this.lockedEndpoints = lockedEndpoints
  }
}

const LOCK_RE = /user is locked|exhausted balance/i

/** Endpoints exercised by AI Director defaults + storyboard keyframes. */
export const FAL_HEALTH_PROBE_ENDPOINTS = [
  falEndpoint('gemini-25-flash-image'),
  falEndpoint('veo3'),
  falEndpoint('kling-video/v3/pro/text-to-video'),
  'bytedance/seedance-2.0/text-to-video',
] as const

export interface FalAccountHealth {
  ok: boolean
  keyPrefix: string
  probes: ProbeResult[]
  locked: string[]
  working: string[]
  message: string
}

export async function checkFalAccountHealth(
  endpoints: readonly string[] = FAL_HEALTH_PROBE_ENDPOINTS,
): Promise<FalAccountHealth> {
  const key = getFalKey()
  const probes = await Promise.all(endpoints.map((ep) => probeEndpoint(ep, key)))
  const locked = probes.filter((p) => p.status === 'LOCKED').map((p) => p.endpoint)
  const working = probes.filter(
    (p) => p.status === 'VALID' || p.status === 'VALID_QUEUED',
  ).map((p) => p.endpoint)

  const ok = working.length > 0 && locked.length === 0

  let message: string
  if (ok) {
    message = `fal.ai ready (${working.length}/${probes.length} probes OK)`
  } else if (locked.length > 0 && working.length > 0) {
    message =
      `fal.ai partially locked — blocked: ${locked.join(', ')}. `
      + 'Top up at fal.ai/dashboard/billing or deselect those models.'
  } else if (locked.length > 0) {
    message =
      'fal.ai account locked (vendor balance exhausted). '
      + 'Top up at fal.ai/dashboard/billing. If funds already show, email support@fal.ai.'
  } else {
    message = 'fal.ai probes failed — check FAL_KEY and network.'
  }

  return {
    ok,
    keyPrefix: key.slice(0, 8),
    probes,
    locked,
    working,
    message,
  }
}

export async function assertFalAccountUnlocked(
  endpoints: readonly string[] = FAL_HEALTH_PROBE_ENDPOINTS,
): Promise<void> {
  const health = await checkFalAccountHealth(endpoints)

  if (health.locked.length > 0) {
    throw new FalAccountLockedError(
      health.message + (health.locked.length
        ? ` Locked endpoints: ${health.locked.join(', ')}.`
        : ''),
      health.locked,
    )
  }

  if (health.working.length === 0) {
    const detail = health.probes
      .map((p) => `${p.endpoint}: ${p.status}${p.code ? ` (${p.code})` : ''}`)
      .join('; ')
    throw new FalAccountLockedError(
      `fal.ai health check failed — no endpoints accepted queue submit. ${detail}`,
    )
  }
}

export function isFalBalanceError(message: string): boolean {
  return LOCK_RE.test(message)
}

export function formatFalBalanceError(raw: string): string {
  if (!isFalBalanceError(raw)) return raw
  return (
    'fal.ai vendor balance is exhausted or the account is locked — not your Cinema credit balance. '
    + 'Top up at fal.ai/dashboard/billing. '
    + 'If the dashboard already shows funds, email support@fal.ai for a manual unlock.'
  )
}

/** Parse SDK / fetch errors for fal lock responses. */
export function extractFalLockFromError(err: unknown): string | null {
  if (!err || typeof err !== 'object') {
    return isFalBalanceError(String(err)) ? String(err) : null
  }
  const e = err as { message?: string; body?: { detail?: unknown }; status?: number }
  const detail = e.body?.detail
  if (isFalLockDetail(detail)) {
    return typeof detail === 'string' ? detail : JSON.stringify(detail)
  }
  if (e.message && isFalBalanceError(e.message)) return e.message
  if (e.status === 403 && e.message) return e.message
  return null
}
