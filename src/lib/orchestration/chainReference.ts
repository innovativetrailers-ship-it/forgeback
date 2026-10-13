import { db } from '@/lib/db'
import { isEphemeralVideoUrl } from '@/lib/media/ephemeralUrls'
import { getSignedDownloadUrl, objectKeyFromStored } from '@/lib/storage/r2'

/** The copy we own. Provider CDN urls are not a chain reference. */
export async function durableChainReference(
  clipId: string,
): Promise<{ mediaPath: string; fetchUrl: string } | null> {
  const clip = await db.studioClip.findUnique({
    where: { id: clipId },
    select: { storageKey: true, videoUrl: true },
  })
  if (!clip) return null
  const mediaPath = `/api/media/${clipId}`
  const key = clip.storageKey || objectKeyFromStored(clip.videoUrl)
  if (key) {
    try {
      return { mediaPath, fetchUrl: await getSignedDownloadUrl(key, 3600) }
    } catch (err) {
      console.warn('[chain_feed] sign failed', err instanceof Error ? err.message : err)
    }
  }
  if (clip.videoUrl && !isEphemeralVideoUrl(clip.videoUrl)) {
    return { mediaPath, fetchUrl: clip.videoUrl }
  }
  return null
}
