export const LIBRARY_KINDS = ['video', 'imported', 'music', 'voice'] as const
export type LibraryKind = (typeof LIBRARY_KINDS)[number]

export interface LibraryItem {
  id: string
  kind: LibraryKind
  sourceUrl: string
  folderId: string | null
  thumbUrl?: string
  label: string
  createdBy: 'generate' | 'import' | 'director'
  variationOf?: string | null
  durationSec: number
  contentType?: string
  transition?: { kind: 'cut' | 'dissolve' | 'fade-in' | 'fade-out' | 'match' | 'flash'; durationMs?: number }
}

export interface LibraryFolder {
  id: string
  projectId: string
  name: string
  parentId: string | null
  kind: 'main' | 'scene' | 'custom'
  sceneId: string | null
  order: number
}

/** A null folderId is the project's MAIN folder. */
export function folderForItem(folderId: string | null | undefined, mainId: string): string {
  return folderId?.trim() || mainId
}

export function isLibraryKind(value: string): value is LibraryKind {
  return (LIBRARY_KINDS as readonly string[]).includes(value)
}

export function contentTypeForKey(key: string, stored?: string | null): string {
  if (stored?.trim()) return stored.trim()
  const path = key.split('?')[0]?.toLowerCase() ?? ''
  if (path.endsWith('.mp3')) return 'audio/mpeg'
  if (path.endsWith('.wav')) return 'audio/wav'
  if (path.endsWith('.m4a')) return 'audio/mp4'
  if (path.endsWith('.ogg')) return 'audio/ogg'
  if (path.endsWith('.webm')) return 'video/webm'
  if (path.endsWith('.mov')) return 'video/quicktime'
  return 'video/mp4'
}

export function trackForKind(kind: LibraryKind): 'video' | 'music' | 'voice' {
  if (kind === 'music') return 'music'
  if (kind === 'voice') return 'voice'
  return 'video'
}

/** Timeline placement references the library row. It does not remove it. */
export function placementFromLibrary(item: LibraryItem, startSec?: number): {
  id: string
  sourceUrl: string
  durationSec: number
  track: 'video' | 'music' | 'voice'
  label: string
  mediaId: string
  posterUrl?: string
  startSec?: number
  transition?: import('@/lib/timeline/schema').Transition
} {
  return {
    id: `place_${item.id}_${Math.round(startSec ?? 0)}`,
    sourceUrl: item.sourceUrl?.trim() || `/api/media/${item.id}`,
    durationSec: item.durationSec > 0 ? item.durationSec : 5,
    track: trackForKind(item.kind),
    label: item.label,
    mediaId: item.id,
    posterUrl: item.thumbUrl,
    startSec,
    transition: item.kind === 'video' || item.kind === 'imported' ? editorTransition(item.transition) : undefined,
  }
}

export function readBoundary(value: unknown): LibraryItem['transition'] | undefined {
  if (!value || typeof value !== 'object') return undefined
  const row = value as { kind?: unknown; durationMs?: unknown }
  const kinds = ['cut', 'dissolve', 'fade-in', 'fade-out', 'match', 'flash']
  if (typeof row.kind !== 'string' || !kinds.includes(row.kind)) return undefined
  const durationMs = typeof row.durationMs === 'number' && row.durationMs > 0 ? row.durationMs : undefined
  return { kind: row.kind as NonNullable<LibraryItem['transition']>['kind'], durationMs }
}

function editorTransition(boundary: LibraryItem['transition']): import('@/lib/timeline/schema').Transition {
  const kind = boundary?.kind ?? 'cut'
  const hard = kind === 'cut' || kind === 'match'
  const seconds = hard ? 0 : Math.min(2, Math.max(0.1, (boundary?.durationMs ?? 500) / 1000))
  return { type: kind, duration: seconds }
}

export function libraryRemainsAfterTimelineRemoval<T extends { id: string }>(
  library: T[],
  removedMediaId: string,
): boolean {
  return library.some((item) => item.id === removedMediaId)
}

export function rehomeFolderItems<T extends { id: string; folderId: string | null }>(
  items: T[],
  deletedFolderId: string,
  mainId: string,
): T[] {
  return items.map((item) => item.folderId === deletedFolderId ? { ...item, folderId: mainId } : item)
}
