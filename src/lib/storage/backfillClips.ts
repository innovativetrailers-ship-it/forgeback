import { db } from '@/lib/db'
import { persistClipVideoToR2 } from '@/lib/storage/persistMedia'
import { clipVideoKey, objectKeyFromStored } from '@/lib/storage/r2'

export interface ClipBackfillReport {
  scanned: number
  mirrored: number
  mediaLost: number
}

function isDeadSource(message: string): boolean {
  return /mirror fetch 4\d\d/.test(message) || /too small/.test(message)
}

/** Copy completed clips that still have only a provider URL. Adds a storage key. Never deletes a clip. */
export async function backfillUnstoredClips(): Promise<ClipBackfillReport> {
  const clips = await db.studioClip.findMany({
    where: { status: 'COMPLETED', storageKey: null, NOT: { videoUrl: null } },
    select: { id: true, videoUrl: true, rawVideoUrl: true, scene: { select: { projectId: true } } },
  })
  let mirrored = 0
  let mediaLost = 0
  for (const clip of clips) {
    const source = (clip.rawVideoUrl || clip.videoUrl || '').trim()
    if (!source) continue
    const already = objectKeyFromStored(source)
    if (already && source.startsWith('http') === false) {
      await db.studioClip.update({ where: { id: clip.id }, data: { storageKey: already } })
      mirrored += 1
      continue
    }
    try {
      const stored = await persistClipVideoToR2(source, clip.scene.projectId, clip.id)
      const storageKey = objectKeyFromStored(stored) ?? clipVideoKey(clip.scene.projectId, clip.id)
      await db.studioClip.update({
        where: { id: clip.id },
        data: {
          storageKey,
          videoUrl: stored,
          rawVideoUrl: clip.rawVideoUrl || clip.videoUrl,
        },
      })
      mirrored += 1
      console.log(`[backfill] mirrored ${clip.id}`)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'download failed'
      if (!isDeadSource(message)) throw err
      await db.studioClip.update({
        where: { id: clip.id },
        data: { statusReason: 'media-lost: the provider URL is expired or unreadable. The clip was kept.' },
      })
      mediaLost += 1
      console.log(`[backfill] media-lost ${clip.id}`)
    }
  }
  return { scanned: clips.length, mirrored, mediaLost }
}
