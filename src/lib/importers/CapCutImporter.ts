import type { ImportedProject, ImportedMediaItem, ImportedTrack } from './types'

export async function importCapCutProject(fileBuffer: Buffer): Promise<ImportedProject> {
  const AdmZip = (await import('adm-zip')).default
  const zip = new AdmZip(fileBuffer)

  const draftEntry =
    zip.getEntry('draft_content.json') ??
    zip.getEntry('draft/draft_content.json')

  if (!draftEntry) throw new Error('Not a valid mobile editor project file')

  const draft = JSON.parse(draftEntry.getData().toString('utf8')) as {
    name?: string
    duration?: number
    fps?: number
    tracks?: Array<{ type: string; segments?: Array<{
      target_timerange?: { start: number; duration: number }
      material_id?: string
    }> }>
    materials?: {
      videos?: Array<{ path?: string; duration?: number }>
      audios?: Array<{ path?: string; duration?: number }>
    }
  }

  const tracks = draft.tracks ?? []
  const materials = draft.materials ?? {}
  const videos = materials.videos ?? []
  const audios = materials.audios ?? []

  const mediaItems: ImportedMediaItem[] = [
    ...videos.map((v) => ({
      name: v.path?.split('/').pop() ?? 'Video',
      filePath: v.path ?? '',
      duration: (v.duration ?? 0) / 1e6,
    })),
    ...audios.map((a) => ({
      name: a.path?.split('/').pop() ?? 'Audio',
      filePath: a.path ?? '',
      duration: (a.duration ?? 0) / 1e6,
    })),
  ]

  const importedTracks: ImportedTrack[] = tracks.map((t) => ({
    type: t.type === 'video' ? 'video' : 'audio',
    clips: (t.segments ?? []).map((s) => ({
      startTime: (s.target_timerange?.start ?? 0) / 1e6,
      duration: (s.target_timerange?.duration ?? 0) / 1e6,
      sourceMediaId: s.material_id,
    })),
  }))

  return {
    projectName: draft.name ?? 'Mobile editor project',
    sequences: [
      {
        name: 'Main Timeline',
        id: 'capcut_main',
        duration: (draft.duration ?? 0) / 1e6,
        frameRate: draft.fps ?? 30,
        tracks: importedTracks,
      },
    ],
    bins: [],
    mediaItems,
  }
}
