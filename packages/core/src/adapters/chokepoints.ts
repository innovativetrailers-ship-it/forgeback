export class GenerationPausedError extends Error {
  readonly code = 'GENERATION_PAUSED' as const

  constructor(message: string) {
    super(message)
    this.name = 'GenerationPausedError'
  }
}

export class PaidCallRefusedError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'PaidCallRefusedError'
  }
}

/** Shared pause predicate. Omitted or any value other than false/0/off means paused. */
export function generationPausedFromEnv(value: string | undefined): boolean {
  if (value === 'false' || value === '0' || value?.toLowerCase() === 'off') return false
  return true
}

/** Every paid call must name its caller. Hosts throw their own error type around this. */
export function requireCallerSource(source: string | undefined): string {
  const caller = source?.trim() ?? ''
  if (!caller || caller === 'UNKNOWN') {
    throw new PaidCallRefusedError('Paid call with no caller source — refusing')
  }
  return caller
}

export interface PaidCallContext {
  source: string
  billableClass?: 'interactive' | 'eval' | 'background'
}
