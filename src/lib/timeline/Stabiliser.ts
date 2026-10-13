import { opaqueObjectKey } from '@/lib/upload/sniff'
/**
 * Video stabilisation engine (A07).
 * Two-pass FFmpeg vidstabdetect + vidstabtransform via BullMQ.
 */
import { randomUUID } from 'crypto'
import { renderQueue } from '@/lib/queue'

export type StabilisationStrength = 'mild' | 'medium' | 'strong'

export interface StabiliseParams {
  clipUrl: string
  strength: StabilisationStrength
  userId: string
}

export interface StabiliseResult {
  outputUrl: string
  jobId: string
}

export interface StabiliseJobPayload {
  jobId: string
  clipUrl: string
  shakiness: number
  smoothing: number
  optzoom: number
  userId: string
  outputR2Key: string
}

const STRENGTH_PRESETS: Record<StabilisationStrength, { shakiness: number; smoothing: number; optzoom: number }> = {
  mild:   { shakiness: 3,  smoothing: 10, optzoom: 0 },
  medium: { shakiness: 7,  smoothing: 15, optzoom: 1 },
  strong: { shakiness: 10, smoothing: 30, optzoom: 2 },
}

export async function stabiliseClip(params: StabiliseParams): Promise<StabiliseResult> {
  const { clipUrl, strength, userId } = params

  if (!clipUrl) throw new Error('[Stabiliser] clipUrl is required')

  const preset = STRENGTH_PRESETS[strength]
  const jobId = `stabilise-${randomUUID()}`
  const outputR2Key = opaqueObjectKey('mp4')

  const payload: StabiliseJobPayload = {
    jobId, clipUrl,
    shakiness: preset.shakiness,
    smoothing: preset.smoothing,
    optzoom:   preset.optzoom,
    userId, outputR2Key,
  }

  try {
    await renderQueue.add('video_stabilise', payload, {
      jobId, priority: 3,
      attempts: 2,
      backoff: { type: 'exponential', delay: 5_000 },
    })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Queue submission failed'
    throw new Error(`[Stabiliser] Failed to queue job: ${message}`)
  }

  const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''
  return { outputUrl: `${r2PublicUrl}/${outputR2Key}`, jobId }
}
