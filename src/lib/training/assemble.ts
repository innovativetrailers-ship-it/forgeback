import AdmZip from 'adm-zip'
import {
  captionForFile,
  trainerDef,
  validateTrainingSet,
  zipEntryName,
  type DatasetMedia,
  type TrainingMediaFile,
} from '@cinema/core'
import { uploadToFal } from '@/lib/fal/client'
import { isolateSubjectImage } from './isolate'

export interface AssembledFile {
  name: string
  kind: DatasetMedia
  caption?: string
  url?: string
  bytes?: Buffer
}

export async function buildTrainingSet(input: {
  trainerKey: string
  files: AssembledFile[]
  triggerPhrase?: string
  isolateSubject?: boolean
}): Promise<{ dataUrl: string; fileCount: number }> {
  const trainer = trainerDef(input.trainerKey)
  if (!trainer) throw new Error(`Unknown trainer ${input.trainerKey}`)

  const meta: TrainingMediaFile[] = input.files.map((file) => ({
    name: file.name,
    kind: file.kind,
    caption: file.caption,
  }))
  const errors = validateTrainingSet(trainer, meta, input.triggerPhrase)
  if (errors.length) throw new Error(errors.join('; '))

  const allowed = new Set(trainer.dataset.types)
  const zip = new AdmZip()
  let index = 0
  for (const file of input.files) {
    if (!allowed.has(file.kind)) continue
    let bytes = file.bytes ?? (file.url ? await downloadBytes(file.url) : null)
    if (!bytes) throw new Error(`No bytes for ${file.name}`)
    if (input.isolateSubject && file.kind === 'image' && file.url) {
      const isolated = await isolateSubjectImage(file.url, input.triggerPhrase)
      if (isolated) bytes = isolated
    }
    const names = zipEntryName(file, index)
    zip.addFile(names.media, bytes)
    const caption = captionForFile(file, input.triggerPhrase)
    if (caption) zip.addFile(names.caption, Buffer.from(caption, 'utf8'))
    index += 1
  }

  const dataUrl = await uploadToFal(zip.toBuffer())
  return { dataUrl, fileCount: index }
}

async function downloadBytes(url: string): Promise<Buffer> {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`Failed to fetch training file (${res.status})`)
  return Buffer.from(await res.arrayBuffer())
}
