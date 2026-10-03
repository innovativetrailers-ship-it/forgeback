import { appendFile, mkdir } from 'node:fs/promises'

let captureFailureCount = 0
let lastCaptureFailureAt: string | null = null

/** In-process signal. "No ShotError rows" is trustworthy only when failing is false. */
export function captureHealth(): { failing: boolean; failures: number; lastCaptureFailureAt: string | null } {
  return {
    failing: captureFailureCount > 0,
    failures: captureFailureCount,
    lastCaptureFailureAt,
  }
}

/** Persist failed. Loud log plus a local jsonl sink. Never throws. */
export async function noteCaptureFailure(err: unknown, original: string, where: string): Promise<void> {
  captureFailureCount += 1
  lastCaptureFailureAt = new Date().toISOString()
  const line = JSON.stringify({
    at: lastCaptureFailureAt,
    where,
    failures: captureFailureCount,
    captureError: err instanceof Error ? err.message : String(err),
    original: original.slice(0, 2000),
  })
  console.error('ERROR-CAPTURE-FAILED', line)
  try {
    const dir = '/tmp/cinema-error-net'
    await mkdir(dir, { recursive: true })
    await appendFile(`${dir}/capture-fallback.jsonl`, `${line}\n`)
  } catch (fileErr) {
    console.error(
      'ERROR-CAPTURE-FAILED',
      'fallback file unavailable',
      fileErr instanceof Error ? fileErr.message : fileErr,
    )
  }
}
