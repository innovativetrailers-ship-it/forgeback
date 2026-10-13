/** Library delete still clears the row. This is the record of an orphaned object. */
export function logR2DeleteFailed(key: string, err: unknown): void {
  const name = err instanceof Error ? err.name : 'Error'
  const message = err instanceof Error ? err.message : String(err)
  console.warn('r2_delete_failed', { key, err: { name, message } })
}

/** Log a caught error's name and message. Never throws. */
export function logCaught(
  stage: string,
  err: unknown,
  context?: Record<string, unknown>,
): void {
  const name = err instanceof Error ? err.name : 'Error'
  const message = err instanceof Error ? err.message : String(err)
  console.warn(`[caught] ${stage}`, { name, message, ...context })
}
