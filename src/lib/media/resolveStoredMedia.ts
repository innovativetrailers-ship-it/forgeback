import { db } from '@/lib/db'
import { objectKeyFromStored, objectExists, getSignedDownloadUrl } from '@/lib/storage/r2'

export interface ResolvedMedia {
  found: boolean
  key: string | null
  reason: 'no_row' | 'no_storage_key' | 'object_missing' | 'ok'
  remoteUrl?: string | null
}

export async function resolveOwnedMedia(id: string, userId: string): Promise<ResolvedMedia> {
  const clip = await db.studioClip.findUnique({
    where: { id },
    select: {
      storageKey: true,
      videoUrl: true,
      rawVideoUrl: true,
      scene: { select: { project: { select: { userId: true } } } },
    },
  })

  if (clip) {
    if (clip.scene.project.userId !== userId) return { found: false, key: null, reason: 'no_row' }
    const key = clip.storageKey?.trim()
      || objectKeyFromStored(clip.videoUrl)
      || objectKeyFromStored(clip.rawVideoUrl)
    return { found: true, key, reason: key ? 'ok' : 'no_storage_key' }
  }

  const asset = await db.asset.findFirst({
    where: { id, ownerId: userId },
    select: { sourceRefs: true, pendingCopy: true },
  })
  if (asset) {
    const remote = asset.pendingCopy
      ? asset.sourceRefs.find((ref) => ref.trim().startsWith('http'))?.trim() ?? null
      : null
    if (remote) return { found: true, key: null, reason: 'ok', remoteUrl: remote }
    const key = asset.sourceRefs.map((ref) => objectKeyFromStored(ref)).find((ref): ref is string => Boolean(ref)) ?? null
    return { found: true, key, reason: key ? 'ok' : 'no_storage_key' }
  }

  const job = await db.renderJob.findFirst({
    where: { id, userId },
    select: { storageKey: true, outputUrl: true },
  })
  if (!job) return { found: false, key: null, reason: 'no_row' }
  const key = job.storageKey?.trim() || objectKeyFromStored(job.outputUrl)
  return { found: true, key, reason: key ? 'ok' : 'no_storage_key' }
}

export async function signedUrlForStoredKey(key: string): Promise<string | null> {
  if (!(await objectExists(key))) return null
  return getSignedDownloadUrl(key, 3600)
}

export function mediaMissMessage(id: string, resolved: ResolvedMedia): string {
  if (!resolved.found) return `No media row for ${id}`
  if (!resolved.key) return `Media ${id} has no stored R2 key`
  return `R2 object missing for ${id} key=${resolved.key}`
}
