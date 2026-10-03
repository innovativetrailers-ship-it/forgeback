import type { GeneratedClip } from '@/components/simple/types'
import { jobPlaybackPath } from '@/lib/media/jobPlayback'
import { probeDuration } from '@/lib/timeline/probeDuration'
import { usePlaybackStore } from '@/store/playbackStore'

const LEGACY_KEY = 'cinema:timeline:pending'

/** One-time import from the old localStorage queue into the shared timeline store. */
export async function importLegacyPendingClips(): Promise<number> {
  if (typeof window === 'undefined') return 0
  const raw = localStorage.getItem(LEGACY_KEY)
  if (!raw) return 0
  localStorage.removeItem(LEGACY_KEY)

  let pending: GeneratedClip[] = []
  try {
    pending = JSON.parse(raw) as GeneratedClip[]
  } catch (err) {
    console.warn("[caught] src/lib/timeline/importLegacyPending.ts:18", err instanceof Error ? { name: err.name, message: err.message } : err)

    return 0
  }

  const addClip = usePlaybackStore.getState().addClip
  let count = 0

  for (const clip of pending) {
    const sourceUrl = jobPlaybackPath(clip.jobId) ?? clip.videoUrl
    if (!sourceUrl || clip.status !== 'complete') continue
    const durationSec = clip.duration > 0 ? clip.duration : await probeDuration(sourceUrl)
    addClip({
      id: clip.jobId,
      sourceUrl,
      posterUrl: clip.thumbnailUrl,
      durationSec,
      track: 'video',
      label: clip.prompt.slice(0, 40),
    })
    count++
  }

  return count
}
