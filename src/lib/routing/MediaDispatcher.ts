import type { SceneSegment } from './types'
import type { SwarmPayload } from '../models'
import { extractTailFrame } from '../orchestration/bridgedGeneration'
import { continuityAgent, applyContinuity, type ContinuityState } from '@/lib/cognition/agents/continuityAgent'
import { resolveModel } from '@cinema/core'

type SegmentResult = { segmentId: string; videoUrl: string }

type GenerateFn = (payload: SwarmPayload) => Promise<string>

const MAX_PARALLEL_CHAINS = 4

async function generatePool(id: string, payload: SwarmPayload): Promise<string> {
  const def = resolveModel(id)
  if (def.provider === 'runway') {
    const { runwayVideo } = await import('@/lib/providers/runway')
    return runwayVideo(def, {
      prompt: payload.prompt,
      duration: payload.duration,
      imageUrl: payload.startFrameUrl,
    })
  }
  const { falVideo } = await import('@/lib/providers/falVideo')
  return falVideo(def, def.canonicalId, {
    registryModel: def.canonicalId,
    prompt: payload.prompt,
    duration: payload.duration,
    imageUrl: payload.startFrameUrl,
  })
}

const ENGINE_GENERATORS: Record<string, GenerateFn> = {
  'veo-3.1': (p) => generatePool('veo-3.1', p),
  veo3: (p) => generatePool('veo-3.1', p),
  veo_3_1: (p) => generatePool('veo-3.1', p),
  'kling-3.0': (p) => generatePool('kling-3.0', p),
  kling: (p) => generatePool('kling-3.0', p),
  kling_pro: (p) => generatePool('kling-3.0', p),
  kling_standard: (p) => generatePool('kling-3.0', p),
  'seedance-2.0': (p) => generatePool('seedance-2.0', p),
  seedance: (p) => generatePool('seedance-2.0', p),
  'runway-gen4': (p) => generatePool('runway-gen4', p),
  runway: (p) => generatePool('runway-gen4', p),
  'grok-imagine-video': (p) => generatePool('grok-imagine-video', p),
  grok: (p) => generatePool('grok-imagine-video', p),
  'wan-2.7': (p) => generatePool('wan-2.7', p),
  'ltx-2.3-fast': (p) => generatePool('ltx-2.3-fast', p),
  ltx: (p) => generatePool('ltx-2.3-fast', p),
  'gemini-omni': (p) => generatePool('gemini-omni', p),
  omni: (p) => generatePool('gemini-omni', p),
  'gemini-omni-flash': (p) => generatePool('gemini-omni', p),
}

function resolveGenerator(engineId: string): GenerateFn {
  const fn = ENGINE_GENERATORS[engineId]
  if (!fn) throw new Error(`Unknown model '${engineId}'. It is not in the pool.`)
  return fn
}

async function getCharacterRefs(characterIds?: string[]): Promise<string[]> {
  if (!characterIds?.length) return []
  const { db } = await import('../db')
  const chars = await db.vaultCharacter.findMany({
    where: { id: { in: characterIds } },
    select: { referenceUrls: true },
  })
  return chars.flatMap((c) => c.referenceUrls ?? [])
}

function groupByShot(segments: SceneSegment[]): SceneSegment[][] {
  const map = new Map<string, SceneSegment[]>()
  for (const seg of segments) {
    const key = seg.shotId
    const list = map.get(key) ?? []
    list.push(seg)
    map.set(key, list)
  }
  return [...map.values()].map((chain) =>
    chain.sort((a, b) => a.startSeconds - b.startSeconds),
  )
}

async function dispatchChain(
  chain: SceneSegment[],
  onSegmentComplete?: (segmentId: string, videoUrl: string) => void,
): Promise<SegmentResult[]> {
  const results: SegmentResult[] = []
  let anchorFrameUrl: string | undefined
  let continuity: ContinuityState | null = null

  for (const seg of chain) {
    const generate = resolveGenerator(seg.engineId)
    const characterRefs = await getCharacterRefs(seg.characterIds)
    const duration = Math.max(1, seg.endSeconds - seg.startSeconds)

    let prompt = seg.prompt
    try {
      continuity = await continuityAgent.execute({ shotPrompt: seg.prompt, prior: continuity })
      prompt = applyContinuity(prompt, continuity)
    } catch (err) {
      console.warn("[caught] src/lib/routing/MediaDispatcher.ts:100", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* best-effort */ }

    const startFrameUrl = anchorFrameUrl ?? seg.anchorStartFrameUrl ?? seg.styleReferenceUrl

    const videoUrl = await generate({
      prompt,
      negativePrompt: 'blurry, watermark, duplicate faces, overexposed',
      duration,
      aspectRatio: '16:9',
      characterRefs,
      startFrameUrl,
    })

    onSegmentComplete?.(seg.segmentId, videoUrl)
    results.push({ segmentId: seg.segmentId, videoUrl })

    const isLast = chain.indexOf(seg) === chain.length - 1
    if (!isLast) {
      try {
        anchorFrameUrl = await extractTailFrame(videoUrl)
      } catch (err) {
        console.warn("[caught] src/lib/routing/MediaDispatcher.ts:120", err instanceof Error ? { name: err.name, message: err.message } : err)

        anchorFrameUrl = undefined
      }
    }
  }

  return results
}

export async function dispatchClip(params: {
  segments: SceneSegment[]
  onSegmentComplete?: (segmentId: string, videoUrl: string) => void
}): Promise<SegmentResult[]> {
  const chains = groupByShot(params.segments)
  const all: SegmentResult[] = []

  for (let i = 0; i < chains.length; i += MAX_PARALLEL_CHAINS) {
    const batch = chains.slice(i, i + MAX_PARALLEL_CHAINS)
    const batchResults = await Promise.all(
      batch.map((chain) => dispatchChain(chain, params.onSegmentComplete)),
    )
    batchResults.forEach((r) => all.push(...r))
  }

  return all
}
