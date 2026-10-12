const buckets = new Map<string, { count: number; resetAt: number }>()

/** Returns true when the caller is still inside the limit. */
export function allowRate(key: string, limit: number, windowMs: number, now = Date.now()): boolean {
  const current = buckets.get(key)
  if (!current || current.resetAt <= now) {
    buckets.set(key, { count: 1, resetAt: now + windowMs })
    return true
  }
  if (current.count >= limit) return false
  current.count += 1
  return true
}

export function resetRateBuckets(): void {
  buckets.clear()
}

export function diagnosticsBypassAllowed(env: NodeJS.ProcessEnv = process.env): boolean {
  if (env.NODE_ENV === 'production' && env.DIAGNOSTICS_DEV === 'true') {
    throw new Error('DIAGNOSTICS_DEV must not be set when NODE_ENV is production')
  }
  return env.DIAGNOSTICS_DEV === 'true' && env.NODE_ENV !== 'production'
}
