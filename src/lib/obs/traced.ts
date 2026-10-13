/** Named step tracing with hang detection — surfaces the chokepoint before FAL. */

export async function traced<T>(
  jobId: string,
  step: string,
  ms: number,
  fn: () => Promise<T>,
): Promise<T> {
  const t0 = Date.now()
  console.log('[step_start]', JSON.stringify({ jobId, step }))
  const timer = setTimeout(() => {
    console.error('[step_HANG]', JSON.stringify({ jobId, step, waitedMs: Date.now() - t0 }))
  }, ms)
  try {
    const r = await fn()
    console.log('[step_done]', JSON.stringify({ jobId, step, ms: Date.now() - t0 }))
    return r
  } finally {
    clearTimeout(timer)
  }
}
