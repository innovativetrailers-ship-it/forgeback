/** FAL validation / namespace errors — non-retryable, surface the stored execution body. */

export class FalValidationError extends Error {
  readonly endpoint: string

  constructor(message: string, endpoint: string) {
    super(message)
    this.name = 'FalValidationError'
    this.endpoint = endpoint
  }
}

const VALIDATION_RE =
  /field required|path .* not found|not found|validation error|invalid.*payload|unprocessable/i

export function isFalValidationDetail(detail: unknown): boolean {
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail ?? '')
  return VALIDATION_RE.test(text)
}

export function throwIfFalValidation(detail: unknown, endpoint: string): void {
  if (!isFalValidationDetail(detail)) return
  const text = typeof detail === 'string' ? detail : JSON.stringify(detail ?? '')
  throw new FalValidationError(text, endpoint)
}

export function classifyFalError(err: unknown, endpoint: string): Error {
  if (err instanceof FalValidationError) return err
  const msg = err instanceof Error ? err.message : String(err)
  if (isFalValidationDetail(msg)) return new FalValidationError(msg, endpoint)
  if (err instanceof Error) return err
  return new Error(msg)
}
