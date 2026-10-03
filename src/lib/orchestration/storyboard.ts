// Phase 1.5: Frame-Zero keyframe stills — checkpointed, individually retried, timeout-bounded

import { generateImage, imageModelForQuality, IMAGE_FAL_TIMEOUT_MS } from '@/lib/engines/imageGen'
import { uploadToR2 } from '@/lib/storage/r2'
import { loadKeyframeCheckpoint, saveKeyframeCheckpoint } from './checkpoints'
import type { StructuredShot, PatientZeroAssets } from './types'

const KEYFRAME_MAX_ATTEMPTS = 1

export interface StoryboardOptions {
  jobId?:      string
  onProgress?: (done: number, total: number, detail?: string) => void
  onPoll?:     () => void | Promise<void>
}

function buildKeyframePrompt(shot: StructuredShot): string {
  const subjects = [...(shot.charactersPresent ?? []), ...(shot.locationsPresent ?? [])].filter(Boolean)
  const present = subjects.length ? `Already in frame: ${subjects.join(', ')}.` : 'Every subject named below is already visible.'
  return `Single film still, the first frame of this shot. ${present} One lighting state. No before-and-after.
${shot.visualPrompt ?? ''}
Camera: ${shot.cameraMove ?? 'static'}. Lighting: ${shot.lighting ?? 'natural'}. Mood: ${shot.mood ?? 'calm'}.`
}

function nameList(value: unknown): string[] {
  if (!Array.isArray(value)) return []
  return value.filter((item): item is string => typeof item === 'string' && item.trim().length > 0)
}

async function generateSingleKeyframe(
  shot:    StructuredShot,
  assets:  PatientZeroAssets,
  options: StoryboardOptions,
): Promise<StructuredShot> {
  const { jobId, onPoll } = options

  if (jobId) {
    const cached = await loadKeyframeCheckpoint(jobId, shot.shotIndex)
    if (cached) return { ...shot, storyboardUrl: cached }
  }

  const characters = assets?.characters ?? []
  const locations = assets?.locations ?? []
  const charRef = nameList(shot.charactersPresent)
    .map((name) => characters.find((c) => c.name === name)?.imageUrl)
    .filter(Boolean)[0]
  const locRef = nameList(shot.locationsPresent)
    .map((name) => locations.find((l) => l.name === name)?.imageUrl)
    .filter(Boolean)[0]

  const prompt = buildKeyframePrompt(shot)
  let lastErr: unknown

  for (let attempt = 1; attempt <= KEYFRAME_MAX_ATTEMPTS; attempt++) {
    try {
      const [rawUrl] = await generateImage(prompt, {
        quality:     'reference',
        aspectRatio: '16:9',
        refImageUrl: charRef ?? locRef,
        onPoll,
        timeoutMs:   IMAGE_FAL_TIMEOUT_MS,
      })
      if (!rawUrl) throw new Error('storyboard keyframe returned no image')

      const buf = await fetch(rawUrl).then((r) => r.arrayBuffer())
      const storyboardUrl = await uploadToR2(
        Buffer.from(buf),
        `storyboard/${shot.shotIndex}_${Date.now()}.jpg`,
        'image/jpeg',
      )

      if (jobId) await saveKeyframeCheckpoint(jobId, shot.shotIndex, storyboardUrl)
      return { ...shot, storyboardUrl }
    } catch (err) {
      lastErr = err
      if (attempt < KEYFRAME_MAX_ATTEMPTS) {
        console.warn(
          `[storyboard] shot ${shot.shotIndex} attempt ${attempt} failed (${imageModelForQuality('reference')}):`,
          err instanceof Error ? err.message : err,
        )
      }
    }
  }

  throw lastErr instanceof Error
    ? lastErr
    : new Error(`Keyframe ${shot.shotIndex + 1} failed after ${KEYFRAME_MAX_ATTEMPTS} attempts`)
}

export async function generateStoryboard(
  shots:   StructuredShot[],
  assets:  PatientZeroAssets,
  options: StoryboardOptions | ((done: number, total: number) => void) = {},
): Promise<StructuredShot[]> {
  const opts: StoryboardOptions = typeof options === 'function'
    ? { onProgress: options }
    : options

  const list = Array.isArray(shots) ? shots : []
  const total = list.length
  let done = 0

  const results = await Promise.allSettled(
    list.map(async (shot) => {
      const result = await generateSingleKeyframe(shot, assets, opts)
      done++
      opts.onProgress?.(done, total, `Keyframe ${done}/${total}`)
      return result
    }),
  )

  const failed: string[] = []
  const settled = results.map((result, index) => {
    if (result.status === 'fulfilled') return result.value
    const reason = result.reason instanceof Error ? result.reason.message : String(result.reason)
    failed.push(`shot ${list[index]?.shotIndex ?? index}: ${reason}`)
    return list[index]
  })

  if (failed.length > 0) {
    console.warn(
      `[storyboard] ${failed.length} keyframe(s) skipped; those shots continue as text-to-video: ${failed.join('; ')}`,
    )
  }

  return settled
}
