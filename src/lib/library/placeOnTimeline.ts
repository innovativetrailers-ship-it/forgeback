import { placementFromLibrary, trackForKind, type LibraryItem, type LibraryKind } from '@/lib/library/model'
import { appendTimelineClipToPlayback } from '@/lib/timeline/syncToPlayback'

export function placeDraggedLibraryItem(raw: string, trackHint: 'video' | 'music' | 'voice', startSec?: number): string | null {
  let item: LibraryItem
  try {
    item = JSON.parse(raw) as LibraryItem
  } catch (err) {
    console.warn('[library] drop payload', err instanceof Error ? err.message : err)
    return 'That drop was not a library take.'
  }
  if (!item?.id || !item.kind) return 'That drop was not a library take.'
  const wanted = trackForKind(item.kind as LibraryKind)
  if (wanted !== trackHint) {
    return `${item.kind} takes go on the ${wanted} track.`
  }
  const placement = placementFromLibrary(item, startSec)
  appendTimelineClipToPlayback({ ...placement, imported: true })
  return null
}
