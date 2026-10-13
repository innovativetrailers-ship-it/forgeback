import { submitToFal } from '@/lib/fal/falQueue'
import { db } from '@/lib/db'

export async function replayShotError(errorId: string): Promise<{ requestId: string; endpoint: string }> {
  const row = await db.shotError.findUnique({ where: { id: errorId } })
  if (!row) throw new Error('ShotError not found')
  const snapshot = row.payloadSnapshot
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot)) {
    throw new Error('No payloadSnapshot to replay')
  }
  const submission = await submitToFal(
    row.endpoint,
    snapshot as Record<string, unknown>,
    'diagnostics.replay',
  )
  return { requestId: submission.requestId, endpoint: row.endpoint }
}

export async function flagEndpointForReverify(endpoint: string): Promise<void> {
  const { genLog } = await import('./correlation')
  try {
    const { probeEndpoint } = await import('@/lib/fal/probeEndpoint')
    const result = await probeEndpoint(endpoint)
    genLog('warn', 'endpoint_reverify', {
      endpoint,
      stage: 'submit',
      probeStatus: result.status,
      probeCode: result.code ?? null,
    })
  } catch (err) {
    genLog('warn', 'endpoint_reverify', {
      endpoint,
      stage: 'submit',
      probeStatus: 'NETWORK_ERROR',
      detail: err instanceof Error ? err.message : String(err),
    })
  }
}
