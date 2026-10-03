/**
 * Abortable FAL queue polling — uses FAL-provided status/response URLs.
 */

import { extractFalLockFromError, formatFalBalanceError } from '@/lib/fal/accountStatus'
import { classifyFalError, FalValidationError } from '@/lib/fal/falErrors'
import { forceRefreshConstraints } from '@/lib/fal/schemaSync'
import {
  pollFalResult,
  submitToFal,
  withVideoGenLock,
  type FalSubmission,
} from '@/lib/fal/falQueue'

export class FalTimeoutError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'FalTimeoutError'
  }
}

export interface FalProgressUpdate {
  status: 'IN_QUEUE' | 'IN_PROGRESS' | 'COMPLETED'
  position?: number
  message?: string
}

const DEFAULT_POLL_MS = 3_000

export const IMAGE_FAL_TIMEOUT_MS = 120_000

export interface FalWithTimeoutOptions {
  onProgress?: (update: FalProgressUpdate) => void
  onPoll?: () => void | Promise<void>
  pollIntervalMs?: number
  submission?: FalSubmission
  /** Rebuild input after 422 schema refresh — enables one self-heal retry. */
  rebuildInput?: () => Promise<Record<string, unknown>>
  /** Caller attribution for fal_submit audit log (required at submit). */
  source?: string
  checkpoint?: {
    save: (submission: FalSubmission) => Promise<void>
    load: () => Promise<FalSubmission | null>
    clear: () => Promise<void>
  }
}

export async function falWithTimeout<T = unknown>(
  endpoint: string,
  input: Record<string, unknown>,
  timeoutMs: number,
  options?: FalWithTimeoutOptions,
): Promise<T> {
  return withVideoGenLock(async () => {
    const pollIntervalMs = options?.pollIntervalMs ?? DEFAULT_POLL_MS

    let submission = options?.submission ?? options?.checkpoint?.load
      ? await options.checkpoint!.load()
      : null

    let currentInput = input
    let submitAttempt = 0

    if (!submission) {
      while (submitAttempt < 2) {
        const { assertGenerationNotPaused } = await import('@/lib/generation/pause')
        assertGenerationNotPaused(endpoint)
        try {
          submission = await submitToFal(endpoint, currentInput, options?.source ?? 'fal:withTimeout')
          if (options?.checkpoint) {
            await options.checkpoint.save(submission)
          }
          break
        } catch (err) {
          const lock = extractFalLockFromError(err)
          if (lock) throw new Error(formatFalBalanceError(lock) + ` (${endpoint})`)
          if (
            submitAttempt === 0 &&
            err instanceof FalValidationError &&
            options?.rebuildInput
          ) {
            await forceRefreshConstraints(endpoint)
            currentInput = await options.rebuildInput()
            submitAttempt++
            continue
          }
          throw err
        }
      }
    }

    if (!submission) {
      throw new Error(`FAL submit failed for ${endpoint}`)
    }

    try {
      const result = await pollFalResult(submission, {
        timeoutMs,
        pollIntervalMs,
        jobHeartbeat: options?.onPoll,
        onProgress: (pct, log, queuePosition, falStatus) => {
          const pos = typeof queuePosition === 'number' ? queuePosition : undefined
          if (falStatus === 'COMPLETED' || pct >= 100) {
            options?.onProgress?.({ status: 'COMPLETED', position: pos })
          } else if (falStatus === 'IN_PROGRESS' || pct > 0) {
            options?.onProgress?.({ status: 'IN_PROGRESS', message: log ?? 'Processing…', position: pos })
          } else {
            options?.onProgress?.({ status: 'IN_QUEUE', position: pos })
          }
        },
      })

      if (options?.checkpoint) {
        await options.checkpoint.clear()
      }

      return result.data as T
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      if (msg.includes('timed out')) {
        throw new FalTimeoutError(msg)
      }
      throw classifyFalError(err, endpoint)
    }
  }, { endpoint })
}
