/**
 * Optical-flow retiming engine (A06).
 *
 * Slow-motion (speedFactor < 1): fal.ai film-interpolation generates
 * intermediate frames for smooth results.
 * Speed-up (speedFactor ≥ 1): FFmpeg PTS manipulation via BullMQ.
 */
import { falEndpoint } from '@cinema/core/endpoints'
import { fal, falSubscribeBound} from '@/lib/fal/client'
const falSubscribe = falSubscribeBound('lib.timeline.OpticalFlow')
import { randomUUID } from 'crypto'
import { uploadToR2 } from '@/lib/storage/r2'
import { renderQueue } from '@/lib/queue'

export interface RetimeParams {
  clipUrl: string
  speedFactor: number
  outputFramerate: 24 | 30 | 60
}

export interface RetimeResult {
  outputUrl: string
  originalDuration: number
  newDuration: number
  framesGenerated: number
}

export interface RetimeJobPayload {
  jobId: string
  clipUrl: string
  speedFactor: number
  outputFramerate: number
  outputR2Key: string
}

interface FalInterpolationResponse {
  video: { url: string }
  frames_generated?: number
  duration?: number
}

function isFalInterpolationResponse(v: unknown): v is FalInterpolationResponse {
  if (typeof v !== 'object' || v === null) return false
  const o = v as Record<string, unknown>
  if (typeof o.video !== 'object' || o.video === null) return false
  const video = o.video as Record<string, unknown>
  return typeof video.url === 'string'
}

export async function retimeClip(params: RetimeParams): Promise<RetimeResult> {
  const { clipUrl, speedFactor, outputFramerate } = params

  if (speedFactor <= 0) {
    throw new Error(`[OpticalFlow] Invalid speedFactor ${speedFactor}: must be > 0`)
  }

  // Fast path: speed-up via FFmpeg PTS manipulation
  if (speedFactor >= 1.0) {
    const jobId = `retime-${randomUUID()}`
    const outputR2Key = `retimed/${jobId}.mp4`
    const payload: RetimeJobPayload = { jobId, clipUrl, speedFactor, outputFramerate, outputR2Key }
    await renderQueue.add('retime_speedup', payload, { jobId, priority: 3 })
    const appUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''
    return { outputUrl: `${appUrl}/${outputR2Key}`, originalDuration: 0, newDuration: 0, framesGenerated: 0 }
  }

  // Slow-motion path: fal.ai frame interpolation
  try {
    const multiplier = Math.round(1 / speedFactor)
    const result: unknown = await falSubscribe(falEndpoint('film/interpolation'), {
      input: { video_url: clipUrl, multiplier, output_fps: outputFramerate },
      pollInterval: 2000,
    })

    if (!isFalInterpolationResponse(result)) {
      throw new Error('[OpticalFlow] Unexpected fal.ai response shape')
    }

    const response = await fetch(result.video.url)
    if (!response.ok) throw new Error(`[OpticalFlow] Fetch failed: HTTP ${response.status}`)

    const buffer = Buffer.from(await response.arrayBuffer())
    const r2Key = `retimed/interpolated-${randomUUID()}.mp4`
    const outputUrl = await uploadToR2(buffer, r2Key, 'video/mp4')

    const framesGenerated = typeof result.frames_generated === 'number'
      ? result.frames_generated
      : Math.round((result.duration ?? 10) * outputFramerate)
    const newDuration = framesGenerated / outputFramerate
    const originalDuration = newDuration * speedFactor

    return { outputUrl, originalDuration, newDuration, framesGenerated }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    throw new Error(`[OpticalFlow] Frame interpolation failed: ${message}`)
  }
}
