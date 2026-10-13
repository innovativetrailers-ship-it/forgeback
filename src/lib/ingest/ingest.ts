import { nanoid } from 'nanoid'
import {
  assertIngestConsent,
  type IngestType,
  type UnderstandResult,
} from '@cinema/core'
import { db } from '@/lib/db'
import { uploadToR2 } from '@/lib/storage/r2'
import { detectIngestType } from './detect'
import { parseIngest } from './parse'
import { understandIngest } from './understand'
import { linkIngest, type LinkedEntities } from './link'

export interface IngestInput {
  projectId: string
  userId: string
  consent: boolean
  file?: { buffer: Buffer; filename: string; mime: string }
  url?: string
  text?: string
}

export interface IngestResult {
  type: IngestType
  understood: UnderstandResult
  parsed: { textExcerpt: string; chunks: number; boundaries: number }
  linked: LinkedEntities
  mediaUrl?: string
}

export async function ingest(input: IngestInput): Promise<IngestResult> {
  assertIngestConsent(input.consent)
  const project = await db.project.findFirst({
    where: { id: input.projectId, userId: input.userId },
    select: { id: true, title: true, description: true, premiseLock: true },
  })
  if (!project) throw new Error('Project not found')

  const file = input.file
  const filename = file?.filename ?? filenameFromUrl(input.url)
  const mime = file?.mime ?? ''
  const textHint = input.text ?? (looksText(filename, mime) && file?.buffer ? file.buffer.toString('utf8') : undefined)
  const type = detectIngestType({
    filename,
    mime,
    url: input.url,
    text: textHint,
    buffer: file?.buffer,
  })

  const mediaUrl = await persistMedia(input.projectId, type, file, input.url)
  const parsed = await parseIngest({
    type,
    buffer: file?.buffer,
    text: textHint,
    url: mediaUrl ?? input.url,
    filename,
    mime,
  })
  const understood = await understandIngest({
    parsed,
    type,
    projectTitle: project.title,
    projectSummary: project.description ?? '',
    imageUrl: visualUrl(type, mediaUrl),
  })
  const linked = await linkIngest({
    userId: input.userId,
    projectId: input.projectId,
    type: understood.type || type,
    parsed,
    understood,
    mediaUrl,
  })

  return {
    type: understood.type || type,
    understood,
    parsed: {
      textExcerpt: parsed.text.slice(0, 280),
      chunks: parsed.chunks.length,
      boundaries: parsed.boundaries.length,
    },
    linked,
    mediaUrl,
  }
}

async function persistMedia(
  projectId: string,
  type: IngestType,
  file?: IngestInput['file'],
  url?: string,
): Promise<string | undefined> {
  if (!file?.buffer?.length) return url
  if (looksText(file.filename, file.mime) && (type === 'script' || type === 'treatment' || type === 'unknown' || type === 'link')) {
    return url
  }
  const ext = (file.filename.split('.').pop() ?? 'bin').replace(/[^a-z0-9]/gi, '') || 'bin'
  const key = `ingest/${projectId}/${nanoid()}.${ext}`
  return uploadToR2(file.buffer, key, file.mime || 'application/octet-stream')
}

function visualUrl(type: IngestType, mediaUrl?: string): string | undefined {
  if (!mediaUrl) return undefined
  if (type === 'character_ref' || type === 'location_ref' || type === 'style_ref') return mediaUrl
  return undefined
}

function looksText(filename?: string, mime?: string): boolean {
  const name = (filename ?? '').toLowerCase()
  if (/(text|json|markdown|fountain)/.test(mime ?? '')) return true
  return /\.(txt|md|fountain|fdx|json)$/.test(name)
}

function filenameFromUrl(url?: string): string | undefined {
  if (!url) return undefined
  try {
    return decodeURIComponent(new URL(url).pathname.split('/').pop() ?? '')
  } catch (err) {
    console.warn("[caught] src/lib/ingest/ingest.ts:120", err instanceof Error ? { name: err.name, message: err.message } : err)

    return url.split('/').pop()
  }
}

export type { ParsedIngest } from './parse'
