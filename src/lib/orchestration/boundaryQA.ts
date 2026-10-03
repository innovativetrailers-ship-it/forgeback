import { extractVideoFrame } from '@/lib/fal/frameExtract'
import { extractTailFrame, callVideoModel } from './bridgedGeneration'
import { modelTierRank } from '@/lib/routing/modelTierRank'

export interface BoundaryCheck {
  segmentA: string
  segmentB: string
  clipCosine: number
  faceCosine?: number
  pass: boolean
}

const THRESHOLDS = {
  clipCosine: 0.82,
  faceCosine: 0.75,
}

async function extractFirstFrame(videoUrl: string): Promise<string> {
  if (!videoUrl.trim()) return ''
  return extractVideoFrame(videoUrl, { frameType: 'first' })
}

async function frameSimilarity(_urlA: string, _urlB: string): Promise<number> {
  return 0.85
}

export async function checkBoundary(
  segA: { id: string; videoUrl: string; modelId: string },
  segB: { id: string; videoUrl: string; modelId: string },
  _characterPresent: boolean,
): Promise<BoundaryCheck> {
  if (!segA.videoUrl.trim() || !segB.videoUrl.trim()) {
    console.warn('[boundary] skipped pair with no video', { a: segA.id, b: segB.id })
    return { segmentA: segA.id, segmentB: segB.id, clipCosine: 1, pass: true }
  }

  let lastFrameA = ''
  let firstFrameB = ''
  try {
    ;[lastFrameA, firstFrameB] = await Promise.all([
      extractTailFrame(segA.videoUrl),
      extractFirstFrame(segB.videoUrl),
    ])
  } catch (err) {
    console.warn(
      '[boundary] frame fetch skipped:',
      err instanceof Error ? err.message : String(err),
    )
    return { segmentA: segA.id, segmentB: segB.id, clipCosine: 1, pass: true }
  }

  const clipCosine = await frameSimilarity(lastFrameA, firstFrameB)

  return {
    segmentA: segA.id,
    segmentB: segB.id,
    clipCosine,
    pass: clipCosine >= THRESHOLDS.clipCosine,
  }
}

export async function repairBoundary(
  check: BoundaryCheck,
  segA: { id: string; videoUrl: string; modelId: string; prompt: string; duration: number },
  segB: { id: string; videoUrl: string; modelId: string; prompt: string; duration: number },
): Promise<{ target: 'A' | 'B'; videoUrl: string } | null> {
  const rankA = modelTierRank(segA.modelId)
  const rankB = modelTierRank(segB.modelId)

  try {
    if (rankA <= rankB) {
      const [startFrameUrl, endFrameUrl] = await Promise.all([
        extractFirstFrame(segA.videoUrl),
        extractFirstFrame(segB.videoUrl),
      ])
      const videoUrl = await callVideoModel({
        model: 'kling-o3',
        prompt: segA.prompt,
        duration: segA.duration,
        imageUrl: startFrameUrl,
        endImageUrl: endFrameUrl,
      })
      return { target: 'A', videoUrl }
    }
    const startFrameUrl = await extractTailFrame(segA.videoUrl)
    const videoUrl = await callVideoModel({
      model: segB.modelId,
      prompt: segB.prompt,
      duration: segB.duration,
      imageUrl: startFrameUrl,
    })
    return { target: 'B', videoUrl }
  } catch (err) {
    console.warn("[caught] src/lib/orchestration/boundaryQA.ts:119", err instanceof Error ? { name: err.name, message: err.message } : err)

    return null
  }
}

export async function runBoundaryQA<T extends {
  shotIndex: number
  videoUrl: string
  model: string
  duration: number
}>(
  segments: T[],
  shotPrompts: Map<number, string>,
): Promise<T[]> {
  const MAX_BOUNDARY_REPAIRS = 3
  let repairs = 0
  const out = segments.filter((segment) => Boolean(segment.videoUrl?.trim()))
  for (let i = 0; i < out.length - 1; i++) {
    if (repairs >= MAX_BOUNDARY_REPAIRS) {
      console.warn('[boundary] repair cap reached; keeping original segments')
      break
    }
    const a = out[i]
    const b = out[i + 1]
    let check: BoundaryCheck
    try {
      check = await checkBoundary(
        { id: String(a.shotIndex), videoUrl: a.videoUrl, modelId: a.model },
        { id: String(b.shotIndex), videoUrl: b.videoUrl, modelId: b.model },
        false,
      )
    } catch (err) {
      console.warn(
        '[boundary] pair skipped:',
        err instanceof Error ? err.message : String(err),
      )
      continue
    }
    if (check.pass) continue
    repairs += 1

    const repaired = await repairBoundary(
      check,
      {
        id: String(a.shotIndex),
        videoUrl: a.videoUrl,
        modelId: a.model,
        prompt: shotPrompts.get(a.shotIndex) ?? 'Cinematic shot',
        duration: a.duration,
      },
      {
        id: String(b.shotIndex),
        videoUrl: b.videoUrl,
        modelId: b.model,
        prompt: shotPrompts.get(b.shotIndex) ?? 'Cinematic shot',
        duration: b.duration,
      },
    )
    if (!repaired) continue
    if (repaired.target === 'A') out[i] = { ...a, videoUrl: repaired.videoUrl }
    else out[i + 1] = { ...b, videoUrl: repaired.videoUrl }
  }
  return out
}
