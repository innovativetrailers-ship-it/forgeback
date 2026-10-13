import { importPremiereProject } from './PremiereProjImporter'
import { importDaVinciProject } from './DaVinciImporter'
import { importCapCutProject } from './CapCutImporter'
import { importTimeline } from '@/lib/interchange/OTIOClient'
import { convertToTimelineRecipe } from './RecipeConverter'
import type { TimelineRecipe } from '@/lib/timeline/schema'
import type { ImportedMediaItem, ImportedProject } from './types'

export type ImportSourceApp =
  | 'premiere' | 'davinci' | 'capcut' | 'finalcut'
  | 'avid' | 'edl' | 'otio' | 'raw_media' | 'unknown'

export interface ImportResult {
  recipe: TimelineRecipe
  mediaItems: ImportedMediaItem[]
  offlineMedia: string[]
  warnings: string[]
  sourceApp: ImportSourceApp
}

export async function detectFormat(filename: string, buffer: Buffer): Promise<ImportSourceApp> {
  const ext = filename.toLowerCase().split('.').pop() ?? ''

  if (ext === 'prproj') return 'premiere'
  if (ext === 'drp') return 'davinci'
  if (ext === 'capcut') return 'capcut'
  if (ext === 'fcpxml') return 'finalcut'
  if (ext === 'xml') {
    const sample = buffer.slice(0, 500).toString()
    if (sample.includes('fcpxml')) return 'finalcut'
    if (sample.includes('DaVinciResolve')) return 'davinci'
    return 'finalcut'
  }
  if (ext === 'aaf') return 'avid'
  if (ext === 'edl') return 'edl'
  if (ext === 'otioz' || ext === 'otio') return 'otio'
  if (ext === 'zip') {
    try {
      const AdmZip = (await import('adm-zip')).default
      const zip = new AdmZip(buffer)
      const entries = zip.getEntries().map((e) => e.entryName)
      if (entries.some((e) => e.includes('draft_content.json'))) return 'capcut'
    } catch (err) {
      console.warn("[caught] src/lib/importers/ProjectImporter.ts:43", err instanceof Error ? { name: err.name, message: err.message } : err)

      // not a valid zip — fall through
    }
  }
  if (/\.(mp4|mov|mxf|avi|webm|mp3|wav|aac|flac)$/.test(filename.toLowerCase())) {
    return 'raw_media'
  }
  return 'unknown'
}

export async function importProject(params: {
  filename: string
  buffer: Buffer
  userId: string
  projectName?: string
}): Promise<ImportResult> {
  const sourceApp = await detectFormat(params.filename, params.buffer)
  const warnings: string[] = []
  let rawProject: ImportedProject | null = null

  switch (sourceApp) {
    case 'premiere':
      rawProject = await importPremiereProject(params.buffer)
      break

    case 'davinci':
      rawProject = await importDaVinciProject(params.buffer)
      break

    case 'capcut':
      rawProject = await importCapCutProject(params.buffer)
      break

    case 'finalcut':
    case 'avid':
    case 'edl':
    case 'otio': {
      const file = new File([new Uint8Array(params.buffer)], params.filename)
      const recipe = await importTimeline(file, params.filename)
      return {
        recipe,
        mediaItems: [],
        offlineMedia: [],
        warnings: ['Imported via timeline interchange — re-link media manually if needed'],
        sourceApp,
      }
    }

    case 'raw_media':
      throw new Error('Raw media import: use the media bin upload instead')

    default:
      throw new Error(`Unsupported format: ${params.filename}`)
  }

  if (!rawProject) throw new Error('Import failed — no project data extracted')

  const { recipe, offlineMedia } = await convertToTimelineRecipe(rawProject)

  if (offlineMedia.length > 0) {
    warnings.push(
      `${offlineMedia.length} media file(s) could not be found. Use Re-link Media to locate them.`
    )
  }

  return {
    recipe,
    mediaItems: rawProject.mediaItems,
    offlineMedia,
    warnings,
    sourceApp,
  }
}
