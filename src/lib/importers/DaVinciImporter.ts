import { logCaught } from '@/lib/diagnostics/caught'
import fs from 'fs/promises'
import os from 'os'
import path from 'path'
import type { ImportedProject } from './types'

export async function importDaVinciProject(fileBuffer: Buffer): Promise<ImportedProject> {
  const tmpPath = path.join(os.tmpdir(), `davinci_${Date.now()}.drp`)
  await fs.writeFile(tmpPath, fileBuffer)

  try {
    const Database = (await import('better-sqlite3')).default
    const db = new Database(tmpPath, { readonly: true })

    const timelines = db
      .prepare(`SELECT id, name, settings FROM SmartBin WHERE type = 'Timeline'`)
      .all() as Array<{ id: number; name: string; settings: string }>

    const mediaItems = db
      .prepare(`SELECT id, name, filePath, duration FROM MediaPoolItem`)
      .all() as Array<{ id: number; name: string; filePath: string; duration: number }>

    db.close()

    return {
      projectName: 'DaVinci Resolve Project',
      sequences: timelines.map((t) => ({
        name: t.name,
        id: String(t.id),
        duration: 0,
        frameRate: 24,
        tracks: [],
      })),
      bins: [],
      mediaItems: mediaItems.map((m) => ({
        name: m.name ?? 'Clip',
        filePath: m.filePath ?? '',
        duration: m.duration ?? 0,
      })),
    }
  } finally {
    await fs.unlink(tmpPath).catch((err) => logCaught('lib/importers/DaVinciImporter', err))
  }
}
