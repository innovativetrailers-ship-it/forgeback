import { fal } from '@fal-ai/client'
import { GenerationPausedError, generationPausedFromEnv, requireCallerSource } from '../adapters/chokepoints'
import { falCallKind, recordPaidCall } from '../llm/runLedger'

export interface GuardedFalSubmission {
  requestId: string
  statusUrl: string
  responseUrl: string
  cancelUrl: string
  endpoint: string
}

/** The one FAL queue submit. Web and desktop both call this. */
export async function guardedFalSubmit(input: {
  endpoint: string
  input: Record<string, unknown>
  source: string
  falKey: string
  pausedEnv?: string
  webhookUrl?: string
}): Promise<GuardedFalSubmission> {
  const source = requireCallerSource(input.source)
  const started = Date.now()
  if (generationPausedFromEnv(input.pausedEnv)) {
    throw new GenerationPausedError(`Blocked: GENERATION_PAUSED is ON. endpoint=${input.endpoint}`)
  }
  const key = input.falKey.trim()
  if (!key) throw new Error('AI gateway key is not configured.')
  fal.config({ credentials: key })
  const res = await fal.queue.submit(input.endpoint, {
    input: input.input,
    ...(input.webhookUrl ? { webhookUrl: input.webhookUrl } : {}),
  })
  void source
  const requestId = res.request_id
  const statusUrl = res.status_url
  const responseUrl = res.response_url
  if (!requestId || !statusUrl || !responseUrl) {
    throw new Error(`FAL submit to ${input.endpoint} returned incomplete submission`)
  }
  recordPaidCall({
    kind: falCallKind(input.endpoint),
    purpose: source,
    model: input.endpoint,
    ms: Date.now() - started,
    caller: source,
  })
  return {
    requestId,
    statusUrl,
    responseUrl,
    cancelUrl: res.cancel_url ?? '',
    endpoint: input.endpoint,
  }
}
