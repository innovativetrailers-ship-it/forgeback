import { readFileSync } from 'node:fs'
import pLimit from 'p-limit'
import { db } from '@/lib/db'
import { runFal, extractVideoUrl } from '@/lib/fal/client'
import { exec } from '@/lib/media/ffmpegExec'
import { downloadToTmp } from '@/lib/media/download'
import { uploadToR2 } from '@/lib/storage/r2'
import { loadCheckpoint, saveCheckpoint } from './checkpoints'
import {
  LIP_SYNC_ENGINES,
  lipSyncEngineForMode,
  type AlignmentWord,
  type LipSyncEngineKey,
} from './lipSyncRegistry'
import type { GeneratedSegment } from './types'

const limit = pLimit(3)

export function readAlignmentWords(value: unknown): AlignmentWord[] {
  if (!Array.isArray(value)) return []
  const words: AlignmentWord[] = []
  for (const row of value) {
    if (!row || typeof row !== 'object') continue
    const rec = row as Record<string, unknown>
    const text = typeof rec.text === 'string' ? rec.text.trim() : ''
    const start = typeof rec.start === 'number' ? rec.start : Number.NaN
    const end = typeof rec.end === 'number' ? rec.end : Number.NaN
    if (!text || !Number.isFinite(start) || !Number.isFinite(end) || end <= start) continue
    words.push({ text, start, end })
  }
  return words
}

function logLipSyncAlignment(clipId: string, words: AlignmentWord[]): void {
  console.log('[lipsync_alignment]', {
    clipId,
    words: words.map((word) => ({ text: word.text, start: word.start, end: word.end })),
  })
}

/** LatentSync and Sync accept only video_url/audio_url. The word list trims the audio those engines hear. */
async function audioUrlAlignedToWords(
  audioUrl: string,
  words: AlignmentWord[],
  projectId: string,
  clipId: string,
): Promise<string> {
  logLipSyncAlignment(clipId, words)
  if (words.length === 0) return audioUrl
  const start = words[0]!.start
  const end = words[words.length - 1]!.end
  try {
    const local = await downloadToTmp(audioUrl, 'mp3')
    const trimmed = `${local}.aligned.mp3`
    await exec('ffmpeg', ['-y', '-i', local, '-ss', String(start), '-to', String(end), '-c', 'copy', trimmed])
    return await uploadToR2(
      readFileSync(trimmed),
      `audio/lipsync/${projectId}/${clipId}-aligned.mp3`,
      'audio/mpeg',
    )
  } catch (err) {
    console.warn('[lipsync_alignment] using full dialogue', err instanceof Error ? err.message : err)
    return audioUrl
  }
}

export async function runLipSyncPass(
  clips: GeneratedSegment[],
  projectId: string | undefined,
  jobId: string,
  mode: 'draft' | 'production' = 'draft',
  onPhase?: (detail: string) => void,
): Promise<GeneratedSegment[]> {
  if (!projectId) return clips
  const out = [...clips]

  await Promise.all(out.map((clip, i) => limit(async () => {
    if (!clip.videoUrl?.trim()) {
      console.warn(`[lipsync] shot ${clip.shotIndex} skipped: no video`)
      return
    }
    const studioClip = clip.shotId
      ? await db.studioClip.findUnique({ where: { id: clip.shotId } })
      : await findClipByShotIndex(projectId, clip.shotIndex)

    if (studioClip && !studioClip.lipSyncEnabled) return

    const line = await db.audioTrack.findFirst({
      where: {
        projectId,
        shotPlanId: studioClip?.id ?? clip.shotId,
        type: 'DIALOGUE',
        status: 'READY',
        muted: false,
        url: { not: null },
      },
    })
    if (!line?.url) return

    const ckKey = `lipsync_${studioClip?.id ?? clip.shotIndex}_v${line.version}`
    const existing = await loadCheckpoint(jobId, ckKey)
    if (existing?.videoUrl) {
      out[i] = { ...clip, videoUrl: existing.videoUrl }
      return
    }

    onPhase?.(`Lip sync shot ${i + 1}/${out.length}`)

    const engineKey = (studioClip?.lipSyncModel as LipSyncEngineKey | null)
      ?? lipSyncEngineForMode(mode)
    const engine = LIP_SYNC_ENGINES[engineKey] ?? LIP_SYNC_ENGINES.latentsync

    try {
      const alignmentWords = readAlignmentWords(line.alignmentWords)
      const audioUrl = await audioUrlAlignedToWords(line.url, alignmentWords, projectId, studioClip?.id ?? String(clip.shotIndex))
      const result = await runFal(engine.endpoint, engine.payload({
        videoUrl: clip.videoUrl,
        audioUrl,
        syncMode: 'cut_off',
        alignmentWords,
      }))
      const syncedUrl = extractVideoUrl(result)
      if (!syncedUrl) throw new Error('Lip sync returned no video')

      if (studioClip) {
        await db.studioClip.update({
          where: { id: studioClip.id },
          data: {
            rawVideoUrl: studioClip.rawVideoUrl ?? clip.videoUrl,
            videoUrl: syncedUrl,
          },
        })
      }

      const synced = { ...clip, videoUrl: syncedUrl }
      await saveCheckpoint({
        jobId,
        segmentId: ckKey,
        shotId: clip.shotIndex,
        videoUrl: syncedUrl,
        modelUsed: engineKey,
        cost: 0,
        qaPassed: true,
      })
      out[i] = synced
    } catch (err) {
      console.warn(`[lipsync] shot ${clip.shotIndex} failed:`, err instanceof Error ? err.message : err)
    }
  })))

  return out
}

async function findClipByShotIndex(projectId: string, shotIndex: number) {
  const { listShotPlan } = await import('@/lib/studio/shotPlan')
  const { shots } = await listShotPlan(projectId)
  const card = shots.find((s) => s.shotNumber === shotIndex + 1)
  if (!card) return null
  return db.studioClip.findUnique({ where: { id: card.id } })
}

export async function applyLipSyncToShot(
  clipId: string,
  projectId: string,
  mode: 'draft' | 'production' = 'draft',
): Promise<string> {
  const clip = await db.studioClip.findUnique({
    where: { id: clipId },
    include: { scene: { select: { projectId: true } } },
  })
  if (!clip || clip.scene.projectId !== projectId) {
    throw new Error('Clip not found')
  }
  if (!clip.videoUrl) throw new Error('Clip has no video')

  const line = await db.audioTrack.findFirst({
    where: {
      projectId,
      shotPlanId: clipId,
      type: 'DIALOGUE',
      status: 'READY',
      muted: false,
      url: { not: null },
    },
  })
  if (!line?.url) throw new Error('No dialogue track for this shot')

  const engineKey = (clip.lipSyncModel as LipSyncEngineKey | null) ?? lipSyncEngineForMode(mode)
  const engine = LIP_SYNC_ENGINES[engineKey] ?? LIP_SYNC_ENGINES.latentsync

  const alignmentWords = readAlignmentWords(line.alignmentWords)
  const audioUrl = await audioUrlAlignedToWords(line.url, alignmentWords, projectId, clipId)
  const result = await runFal(engine.endpoint, engine.payload({
    videoUrl: clip.rawVideoUrl ?? clip.videoUrl,
    audioUrl,
    syncMode: 'cut_off',
    alignmentWords,
  }))
  const syncedUrl = extractVideoUrl(result)
  if (!syncedUrl) throw new Error('Lip sync returned no video')

  await db.studioClip.update({
    where: { id: clipId },
    data: {
      rawVideoUrl: clip.rawVideoUrl ?? clip.videoUrl,
      videoUrl: syncedUrl,
    },
  })

  return syncedUrl
}

export async function revertLipSync(clipId: string): Promise<string | null> {
  const clip = await db.studioClip.findUnique({ where: { id: clipId } })
  if (!clip?.rawVideoUrl) return clip?.videoUrl ?? null

  await db.studioClip.update({
    where: { id: clipId },
    data: { videoUrl: clip.rawVideoUrl },
  })
  return clip.rawVideoUrl
}
