/**
 * Luminance keyer (D12).
 * Extracts alpha channel based on pixel luminance via FFmpeg + BullMQ.
 */
import { randomUUID } from 'crypto'
import { renderQueue } from '@/lib/queue'

export interface LumaKeyParams {
  clipUrl: string
  threshold: number  // 0.0–1.0
  feather: number    // 0.0–0.5
  invert: boolean
}

export interface LumaKeyResult {
  outputUrl: string
  jobId: string
}

export interface LumaKeyJobPayload {
  jobId: string
  clipUrl: string
  threshold: number
  feather: number
  invert: boolean
  outputR2Key: string
  filterGraph: string
}

function buildFilterGraph(threshold: number, feather: number, invert: boolean): string {
  const thresh8 = Math.round(threshold * 255)
  const featherPx = Math.round(feather * 255)
  const low  = Math.max(0, thresh8 - featherPx)
  const high = Math.min(255, thresh8 + featherPx)
  const range = Math.max(1, high - low)

  const lumaExpr = invert
    ? `if(lt(val,${low}),0,if(gt(val,${high}),255,255*(val-${low})/${range}))`
    : `if(lt(val,${low}),255,if(gt(val,${high}),0,255*(${high}-val)/${range}))`

  return [
    `split[rgb][luma]`,
    `[luma]format=gray,lutrgb=r='${lumaExpr}':g='${lumaExpr}':b='${lumaExpr}'[alpha]`,
    `[rgb][alpha]alphamerge`,
  ].join(';')
}

export async function applyLumaKey(params: LumaKeyParams): Promise<LumaKeyResult> {
  const { clipUrl, threshold, feather, invert } = params

  if (!clipUrl) throw new Error('[LumaKeyer] clipUrl is required')
  if (threshold < 0 || threshold > 1) throw new Error(`[LumaKeyer] threshold ${threshold} out of range (0.0–1.0)`)
  if (feather < 0 || feather > 0.5) throw new Error(`[LumaKeyer] feather ${feather} out of range (0.0–0.5)`)

  const jobId = `lumakey-${randomUUID()}`
  const outputR2Key = `keyed/${jobId}.mov`
  const filterGraph = buildFilterGraph(threshold, feather, invert)
  const payload: LumaKeyJobPayload = { jobId, clipUrl, threshold, feather, invert, outputR2Key, filterGraph }

  try {
    await renderQueue.add('luma_key', payload, { jobId, priority: 3 })
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Queue submission failed'
    throw new Error(`[LumaKeyer] Failed to queue job: ${message}`)
  }

  const r2PublicUrl = process.env.NEXT_PUBLIC_R2_PUBLIC_URL ?? ''
  return { outputUrl: `${r2PublicUrl}/${outputR2Key}`, jobId }
}
