/**
 * AI Dialogue Matcher (F10).
 * EQ-profile-matches all target takes to a reference hero take via BullMQ.
 */
import { randomUUID } from 'crypto'
import { renderQueue } from '@/lib/queue'

export interface DialogueMatchParams {
  referenceUrl: string
  targetUrls: string[]
}

export interface MatchedTrack {
  original: string
  processed: string
  jobId: string
}

export interface MatchResult {
  processedUrls: MatchedTrack[]
  batchId: string
}

export interface DialogueMatchJobPayload {
  jobId: string
  batchId: string
  referenceUrl: string
  targetUrl: string
  outputR2Key: string
}

export async function matchDialogue(params: DialogueMatchParams): Promise<MatchResult> {
  const { referenceUrl, targetUrls } = params

  if (!referenceUrl) throw new Error('[DialogueMatcher] referenceUrl is required')
  if (targetUrls.length === 0) throw new Error('[DialogueMatcher] At least one targetUrl required')

  const batchId = `dlg-match-${randomUUID()}`
  const processedUrls: MatchedTrack[] = []
  const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''

  for (let i = 0; i < targetUrls.length; i++) {
    const targetUrl = targetUrls[i]
    const jobId = `${batchId}-t${i}`
    const outputR2Key = `dialogue-matched/${batchId}/target_${i}.wav`
    const payload: DialogueMatchJobPayload = { jobId, batchId, referenceUrl, targetUrl, outputR2Key }

    try {
      await renderQueue.add('dialogue_match', payload, { jobId, priority: 4 })
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Queue submission failed'
      throw new Error(`[DialogueMatcher] Failed to queue match job for target ${i}: ${message}`)
    }

    processedUrls.push({ original: targetUrl, processed: `${r2PublicUrl}/${outputR2Key}`, jobId })
  }

  return { processedUrls, batchId }
}
