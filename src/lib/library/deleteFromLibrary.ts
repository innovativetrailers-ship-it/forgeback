import { usePlaybackStore } from '@/store/playbackStore'

/** Confirmed hard delete. Removes the library row, the timeline clip, the job, and the R2 object. Not undoable. */
export async function deleteFromLibrary(id: string): Promise<boolean> {
  const ok = window.confirm(
    'Delete this video from your library? The file is removed and this cannot be undone. Remove from timeline keeps the file.',
  )
  if (!ok) return false
  const res = await fetch('/api/library/delete', {
    method: 'POST',
    credentials: 'include',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ id }),
  })
  if (!res.ok) {
    const body = await res.json().catch((err) => {
      console.warn("[caught] src/lib/library/deleteFromLibrary.ts:16", err instanceof Error ? { name: err.name, message: err.message } : err)
      return (({}))
    }) as { error?: string }
    throw new Error(body.error ?? 'Could not delete')
  }
  const store = usePlaybackStore.getState()
  store.suppressShot(id)
  store.removeLibrary(id)
  store.removeTimelineClip(id, false)
  return true
}
