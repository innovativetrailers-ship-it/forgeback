import { nanoid } from 'nanoid'
import type { TimelineRecipe, Track, Clip } from '@/lib/timeline/schema'
import type { ImportedProject } from './types'

export async function convertToTimelineRecipe(
  project: ImportedProject
): Promise<{ recipe: TimelineRecipe; offlineMedia: string[] }> {
  const offlineMedia: string[] = []
  const mainSeq = project.sequences[0]
  const tracks: Track[] = []

  if (mainSeq?.tracks?.length) {
    for (const importedTrack of mainSeq.tracks) {
      const clips: Clip[] = []

      for (const seg of importedTrack.clips) {
        const mediaItem = project.mediaItems.find((m) =>
          m.filePath.includes(seg.sourceMediaId ?? '')
        )

        let sourceUrl = ''
        if (mediaItem?.filePath) {
          try {
            const { access } = await import('fs/promises')
            await access(mediaItem.filePath)
            sourceUrl = `/api/import/serve?path=${encodeURIComponent(mediaItem.filePath)}`
          } catch (err) {
            console.warn("[caught] src/lib/importers/RecipeConverter.ts:27", err instanceof Error ? { name: err.name, message: err.message } : err)

            offlineMedia.push(mediaItem.filePath)
          }
        }

        const startTime = seg.startTime
        const endTime = seg.startTime + seg.duration

        clips.push({
          id: nanoid(),
          trackId: importedTrack.type === 'video' ? 'v1' : 'a1',
          startTime,
          endTime,
          sourceUrl: sourceUrl || '',
          prompt: mediaItem?.name ?? 'Imported clip',
          modelUsed: 'imported',
          metadata: { imported: true, originalPath: mediaItem?.filePath ?? '' },
        })
      }

      tracks.push({
        id: importedTrack.type === 'video' ? 'v1' : 'a1',
        type: importedTrack.type,
        label: `${importedTrack.type === 'video' ? 'Video' : 'Audio'} 1`,
        muted: false,
        locked: false,
        solo: false,
        clips,
      })
    }
  }

  // Fallback: create empty tracks if no sequence data
  if (tracks.length === 0) {
    tracks.push(
      { id: 'v1', type: 'video', label: 'Video 1', muted: false, locked: false, solo: false, clips: [] },
      { id: 'a1', type: 'audio', label: 'Audio 1', muted: false, locked: false, solo: false, clips: [] }
    )
  }

  const fps = (mainSeq?.frameRate ?? 24) as 24 | 30 | 60
  const validFps = ([24, 30, 60] as const).includes(fps) ? fps : 24

  const recipe: TimelineRecipe = {
    id: `imported_${nanoid(8)}`,
    projectId: '',
    tracks,
    durationSeconds: mainSeq?.duration ?? 0,
    fps: validFps,
    resolution: { width: 1920, height: 1080 },
    colorSpace: 'rec709',
  }

  return { recipe, offlineMedia }
}
