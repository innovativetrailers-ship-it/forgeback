import zlib from 'zlib'
import { parseStringPromise } from 'xml2js'
import { promisify } from 'util'
import type { ImportedProject, ImportedSequence, ImportedBin, ImportedMediaItem } from './types'

const gunzip = promisify(zlib.gunzip)

export async function importPremiereProject(fileBuffer: Buffer): Promise<ImportedProject> {
  let xmlBuffer: Buffer
  try {
    xmlBuffer = await gunzip(fileBuffer)
  } catch (err) {
    console.warn("[caught] src/lib/importers/PremiereProjImporter.ts:12", err instanceof Error ? { name: err.name, message: err.message } : err)

    xmlBuffer = fileBuffer
  }

  const xml = await parseStringPromise(xmlBuffer.toString('utf8'))
  const root = xml?.PremiereData?.Project?.[0]

  const sequences: ImportedSequence[] = []
  const bins: ImportedBin[] = []
  const mediaItems: ImportedMediaItem[] = []

  const rootBin = root?.RootProjectItem?.[0]
  if (rootBin) {
    extractBin(rootBin, bins, sequences, mediaItems)
  }

  return {
    projectName: root?.Name?.[0] ?? 'Imported Premiere Project',
    sequences,
    bins,
    mediaItems,
  }
}

function extractBin(
  bin: Record<string, unknown>,
  bins: ImportedBin[],
  sequences: ImportedSequence[],
  media: ImportedMediaItem[]
): void {
  const children = (bin?.Children as Record<string, unknown>[] | undefined)?.[0]
  const items = (children?.ProjectItem as Record<string, unknown>[] | undefined) ?? []

  for (const item of items) {
    const attrs = item?.$ as Record<string, string> | undefined
    const type = attrs?.type ?? (item?.type as string[] | undefined)?.[0]

    if (type === 'BinProjectItem' || type === '2') {
      bins.push({ name: (item?.Name as string[])?.[0] ?? 'Bin', id: attrs?.ObjectID ?? '' })
      extractBin(item as Record<string, unknown>, bins, sequences, media)
    } else if (type === 'SequenceProjectItem' || type === '1') {
      sequences.push({
        name: (item?.Name as string[])?.[0] ?? 'Sequence',
        id: attrs?.ObjectID ?? '',
        duration: parseFloat((item?.Duration as string[])?.[0] ?? '0'),
        frameRate: parseFloat(
          ((item?.TimebaseList as Record<string, unknown>[])?.[0]
            ?.Timebase as Record<string, unknown>[])?.[0]
            ?.Timebase as string ?? '24'
        ),
        tracks: [],
      })
    } else if (type === 'FootageItem' || type === '4') {
      media.push({
        name: (item?.Name as string[])?.[0] ?? 'Clip',
        filePath:
          (item?.FilePath as string[])?.[0] ??
          (item?.ActualMediaFilePath as string[])?.[0] ??
          '',
        duration: parseFloat((item?.Duration as string[])?.[0] ?? '0'),
      })
    }
  }
}
