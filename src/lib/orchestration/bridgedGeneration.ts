// src/lib/orchestration/bridgedGeneration.ts
// FilmWeaver dual cache + tail-to-head keyframe bridging

import { falEndpoint } from '@cinema/core/endpoints'
import { runFal, extractVideoUrl, extractImageUrl } from '@/lib/fal/client'
import { uploadToR2 } from '@/lib/storage/r2'
import { analyseFrameMotion, injectMotionContext } from './opticalFlow'
import { generateVideo } from './dispatch'
import type { GenerationMode } from './costGuard'
import { seedanceAssetRefs } from './seedanceRefs'
import type { DAGNode, GeneratedSegment, PatientZeroAssets } from './types'

// Per-model generation timeout ceilings (milliseconds).
// Generous — these are HARD caps to prevent infinite hangs, NOT target times.
// A draft finishes in ~30s; premium/open-source models can legitimately take 20+ min.
const MODEL_TIMEOUT_MS: Record<string, number> = {
  'ltx-2.3-fast':       180_000,   //  3 min — fast draft model
  'wan-2.2':            1_200_000, // 20 min — open-source, can be slow on FAL
  'ltx-2.3':            600_000,   // 10 min
  'pika-2.5':           600_000,   // 10 min
  'luma-ray3':          600_000,   // 10 min
  'minimax-2.3':        900_000,   // 15 min
  'hunyuan-video-1.5':  1_200_000, // 20 min — open-source, heavy
  'hunyuan-hy-motion':  1_200_000, // 20 min
  'seedance-2.0':       900_000,   // 15 min
  'skyreels-v3':        1_500_000, // 25 min — long-form generation
  'kling-3.0':          900_000,   // 15 min
  'pixverse-c1':        900_000,   // 15 min
  'pixverse-v6':        600_000,   // 10 min
  'veo-3.1':            900_000,   // 15 min
  'grok-imagine-video': 300_000,   //  5 min — fast model
  'runway-gen4':        900_000,   // 15 min
  'sora-2':             1_200_000, // 20 min — Replicate physics model
  'happyhorse-1.0':     900_000,   // 15 min
  'kling-o3':           900_000,   // 15 min
  'hailuo-2.3':         600_000,   // 10 min
}

const DEFAULT_TIMEOUT_MS = 1_200_000  // 20 min fallback

export function getModelTimeout(model: string): number {
  return MODEL_TIMEOUT_MS[model] ?? DEFAULT_TIMEOUT_MS
}

export function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error(`${label} timed out after ${Math.round(ms / 1000)}s`)), ms)
    ),
  ])
}

export async function extractTailFrame(videoUrl: string): Promise<string> {
  const result = await runFal<{ image?: { url: string }; output_url?: string }>(falEndpoint('ffmpeg'), {
    video_url: videoUrl,
    command: 'extract_last_frame',
    output_format: 'jpg',
  })
  return extractImageUrl(result) ?? result.output_url ?? ''
}

export interface VideoModelParams {
  model:           string
  prompt:          string
  duration:        number
  imageUrl?:       string
  endImageUrl?:    string
  patientZeroUrl?: string
  characterIds?:   string[]
  locationId?:     string | null
  projectId?:      string
  camera?:         import('@cinema/core').PromptCamera | null
  genrePresetId?:  string | null
  continueExactFrame?: boolean
  referenceImages?: { url: string; label?: string; role: 'character' | 'location'; primary?: boolean }[]
  referenceVideos?: { url: string; label?: string; role?: 'motion_ref' | 'style_ref' | 'continuation' }[]
  referenceAudios?: { url: string; label?: string; role?: 'dialogue' | 'music' | 'sfx' }[]
  jobId?:           string
  shotIndex?:       number
  generationMode?:  GenerationMode
  resolution?:      string
  characterLora?:   import('@cinema/core').LoraAssetRef
  styleLora?:       import('@cinema/core').LoraAssetRef
  onSubProgress?:   import('./types').SubProgressFn
  onPoll?:          () => void | Promise<void>
  onSubmission?:    (submission: import('@/lib/fal/falQueue').FalSubmission) => void | Promise<void>
}

export async function callVideoModel(params: VideoModelParams): Promise<string> {
  return runVideoModel(params)
}

async function runVideoModel(params: VideoModelParams): Promise<string> {
  return generateVideo(params)
}

export async function generateWithBridging(
  dag:        DAGNode[],
  assets:     PatientZeroAssets,
  onProgress: (data: {
    shotIndex:    number
    totalShots:   number
    status:       string
    subProgress?: number
    subMessage?:  string
  }) => void
): Promise<GeneratedSegment[]> {

  const results: GeneratedSegment[] = []
  const shotMemoryCache: string[]   = []
  const total = dag.length

  for (const node of dag) {
    onProgress({ shotIndex: node.shot.shotIndex, totalShots: total, status: 'generating' })

    let prompt = node.shot.visualPrompt
    if (shotMemoryCache.length > 0) {
      prompt += ` Maintain visual consistency with previous shots.`
    }

    let tailFrameUrl: string | undefined
    if (node.shot.bridgeRequired && results.length > 0) {
      const prev = results[results.length - 1]
      try {
        tailFrameUrl = await extractTailFrame(prev.videoUrl)
        const motion = await analyseFrameMotion(tailFrameUrl)
        prompt = injectMotionContext(prompt, motion, {
          contentType: dag[node.shot.shotIndex - 1]?.shot.contentType ?? '',
          lighting:    dag[node.shot.shotIndex - 1]?.shot.lighting ?? 'natural_day',
        })
        onProgress({ shotIndex: node.shot.shotIndex, totalShots: total, status: 'bridging' })
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[orchestration] tail frame extraction failed for shot ${node.shot.shotIndex}:`, msg)
      }
    }

    const present = node.shot.charactersPresent ?? []
    const characterRef = present.length > 0
      ? (assets.characters ?? []).find(c => c.name === present[0])?.imageUrl
      : undefined

    let videoUrl = ''
    const MAX_RETRIES = 1

    for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
      try {
        videoUrl = await withTimeout(
          callVideoModel({
            model:          node.assignedModel,
            prompt,
            duration:       node.shot.duration,
            imageUrl:       tailFrameUrl,
            patientZeroUrl: characterRef,
            continueExactFrame: Boolean(tailFrameUrl),
            referenceImages: tailFrameUrl ? undefined : seedanceAssetRefs(node.shot, assets),
            onSubProgress: (sub) => {
              const shotsBefore    = node.shot.shotIndex
              const currentFrac    = sub.pct / 100
              const overallShotPct = ((shotsBefore + currentFrac) / Math.max(total, 1)) * 100
              const bandPct        = 40 + Math.round((overallShotPct / 100) * 48)
              onProgress({
                shotIndex:   node.shot.shotIndex,
                totalShots:  total,
                status:      'generating',
                subProgress: sub.pct,
                subMessage:  `Shot ${node.shot.shotIndex + 1}/${total}: ${sub.message}`,
              })
              void bandPct
            },
          }),
          getModelTimeout(node.assignedModel),
          `Shot ${node.shot.shotIndex} (${node.assignedModel})`,
        )
        break
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err)
        console.warn(`[orchestration] shot ${node.shot.shotIndex} attempt ${attempt + 1} failed:`, msg)
        if (attempt >= MAX_RETRIES) throw err
        await new Promise((r) => setTimeout(r, 3000 * (attempt + 1)))
      }
    }

    try {
      const keyframeUrl = tailFrameUrl ?? await extractTailFrame(videoUrl)
      if (keyframeUrl) {
        const buf  = await fetch(keyframeUrl).then(r => r.arrayBuffer())
        const r2Kf = await uploadToR2(
          Buffer.from(buf),
          `shot-memory/${node.shot.shotIndex}_${Date.now()}.jpg`,
          'image/jpeg'
        )
        shotMemoryCache.push(r2Kf)
      }
    } catch (err) {
      console.warn("[caught] src/lib/orchestration/bridgedGeneration.ts:208", err instanceof Error ? { name: err.name, message: err.message } : err)
 /* non-fatal */ }

    results.push({
      shotIndex:    node.shot.shotIndex,
      videoUrl,
      duration:     node.shot.duration,
      model:        node.assignedModel,
      contentType:  node.shot.contentType,
      tailFrameUrl: tailFrameUrl ?? '',
      qualityScore: 1.0,
      retryCount:   0,
    })
    onProgress({ shotIndex: node.shot.shotIndex, totalShots: total, status: 'complete' })
  }

  return results
}
