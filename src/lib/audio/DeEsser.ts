/**
 * De-esser engine (F06).
 * Queues FFmpeg dynamic EQ targeting sibilance frequencies via BullMQ.
 */
import { randomUUID } from 'crypto'
import { renderQueue } from '@/lib/queue'

export interface DeEsserParams {
  audioUrl: string
  frequency?: number  // Hz, default 7000
  threshold?: number  // dB, default -20
  depth?: number      // dB reduction, default 6
}

export interface DeEsserResult {
  outputUrl: string
  jobId: string
}

export interface DeEsserJobPayload {
  jobId: string
  audioUrl: string
  frequency: number
  threshold: number
  depth: number
  outputR2Key: string
}

export async function deEss(params: DeEsserParams): Promise<DeEsserResult> {
  const audioUrl  = params.audioUrl
  const frequency = params.frequency ?? 7000
  const threshold = params.threshold ?? -20
  const depth     = params.depth ?? 6

  if (!audioUrl) throw new Error('[DeEsser] audioUrl is required')
  if (frequency < 1000 || frequency > 12000) throw new Error(`[DeEsser] frequency ${frequency} Hz out of range (1000–12000)`)
  if (depth < 0 || depth > 24) throw new Error(`[DeEsser] depth ${depth} dB out of range (0–24)`)

  const jobId = `deess-${randomUUID()}`
  const outputR2Key = `deessed/${jobId}.wav`
  const payload: DeEsserJobPayload = { jobId, audioUrl, frequency, threshold, depth, outputR2Key }

  try {
    await renderQueue.add('audio_deess', payload, { jobId, priority: 4 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Queue submission failed'
    throw new Error(`[DeEsser] Failed to queue job: ${message}`)
  }

  const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''
  return { outputUrl: `${r2PublicUrl}/${outputR2Key}`, jobId }
}
