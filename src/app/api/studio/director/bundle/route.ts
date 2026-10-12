import AdmZip from 'adm-zip'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { extractPdfText } from '@/lib/ingest/parse'
import {
  assembleBundle,
  docxText,
  isBundleRole,
  mediaKind,
  needsLlmNormalise,
  rtfText,
  shotsAndEntitiesFromBreakdown,
  type BundleDraft,
  type BundleEntity,
} from '@/lib/ingest/bulkPackage'
import { isGenerationPaused, isGenerationPausedError } from '@/lib/generation/pause'
import { ingestBreakdown } from '@/lib/orchestration/ingestPlan'
import { uploadToR2 } from '@/lib/storage/r2'
import { requireUser } from '@/lib/auth/requireUser'

const TEXT_EXT = new Set(['md', 'markdown', 'txt', 'csv', 'tsv', 'rtf', 'json'])

function extOf(name: string): string {
  return name.toLowerCase().split('.').pop() ?? ''
}

async function textOf(name: string, buffer: Buffer): Promise<string> {
  const ext = extOf(name)
  if (ext === 'pdf' || buffer.slice(0, 4).toString('ascii') === '%PDF') {
    const text = await extractPdfText(buffer)
    return text.trim()
  }
  if (ext === 'docx') {
    const zip = new AdmZip(buffer)
    const xml = zip.getEntry('word/document.xml')?.getData().toString('utf8') ?? ''
    return docxText(xml)
  }
  if (ext === 'doc') return ''
  if (ext === 'rtf') return rtfText(buffer.toString('utf8'))
  if (TEXT_EXT.has(ext)) return buffer.toString('utf8')
  return ''
}

function entriesOf(name: string, buffer: Buffer): Array<{ path: string; buffer: Buffer }> {
  if (extOf(name) !== 'zip') return [{ path: name, buffer }]
  const zip = new AdmZip(buffer)
  return zip.getEntries()
    .filter((entry) => !entry.isDirectory && !entry.entryName.startsWith('__MACOSX') && !entry.entryName.includes('/.'))
    .map((entry) => ({ path: entry.entryName, buffer: entry.getData() }))
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const form = await req.formData().catch((err) => {
    console.warn('[bundle]', err instanceof Error ? err.message : err)
    return null
  })
  if (!form) return NextResponse.json({ error: 'The package could not be read' }, { status: 400 })
  if (form.get('consent') !== 'true') {
    return NextResponse.json({ error: 'Confirm this package is yours before importing it' }, { status: 400 })
  }
  if (form.get('confirm') === 'true') {
    try {
      const draft = JSON.parse(String(form.get('draft') ?? '')) as BundleDraft
      const saved = await persistDraft(userId, draft)
      return NextResponse.json({ saved, generated: false })
    } catch (err) {
      console.warn('[bundle]', err instanceof Error ? err.message : err)
      return NextResponse.json({ error: 'The reviewed package could not be saved' }, { status: 400 })
    }
  }
  const files = form.getAll('file').filter((item): item is File => item instanceof File)
  if (!files.length) return NextResponse.json({ error: 'Add a document or a zip' }, { status: 400 })
  const roles = JSON.parse(String(form.get('roles') ?? '{}')) as Record<string, string>
  const inputs: Array<{ path: string; role?: string; text?: string }> = []
  const mediaUrls: Record<string, string> = {}
  for (const file of files.slice(0, 40)) {
    const buffer = Buffer.from(await file.arrayBuffer())
    if (buffer.length > 8_000_000) {
      inputs.push({ path: file.name, text: '' })
      continue
    }
    for (const entry of entriesOf(file.name, buffer)) {
      const media = mediaKind(entry.path)
      if (media) {
        const stored = await uploadToR2(entry.buffer, `bundle/${userId}/${Date.now()}-${entry.path.split('/').pop()}`, 'application/octet-stream')
        mediaUrls[entry.path] = stored
        inputs.push({ path: entry.path, role: roles[entry.path] })
        continue
      }
      const role = roles[file.name] ?? roles[entry.path]
      const text = await textOf(entry.path, entry.buffer)
      inputs.push({ path: entry.path, role: isBundleRole(role ?? '') ? role : undefined, text })
    }
  }
  const draft = assembleBundle(inputs)
  const paused = isGenerationPaused()
  for (const input of inputs) {
    if (!input.text || !needsLlmNormalise(input.path, input.text)) continue
    if (paused) {
      draft.attention.push({
        file: input.path,
        text: input.text.slice(0, 2000),
        reason: 'Generation is paused. This prose was kept and not normalised.',
      })
      continue
    }
    try {
      const breakdown = await ingestBreakdown({
        prompt: input.text,
        totalDuration: 60,
        selectedModels: [],
        userId,
        ingest: true,
      })
      const merged = shotsAndEntitiesFromBreakdown(breakdown, input.path)
      if (merged.fallback || (!merged.shots.length && !merged.entities.length)) {
        draft.attention.push({
          file: input.path,
          text: input.text.slice(0, 2000),
          reason: 'The ingest path did not return a typed breakdown. The text was kept.',
        })
        continue
      }
      draft.shots.push(...merged.shots)
      draft.entities.push(...merged.entities)
      if (merged.shots.length) draft.screenplay = [draft.screenplay, input.text].filter(Boolean).join('\n\n')
    } catch (err) {
      console.warn('[bundle]', err instanceof Error ? err.message : err)
      const pausedCall = isGenerationPausedError(err)
      draft.attention.push({
        file: input.path,
        text: input.text.slice(0, 2000),
        reason: pausedCall
          ? 'Generation is paused. This prose was kept and not normalised.'
          : 'The prose could not be normalised. The text was kept.',
      })
    }
  }
  return NextResponse.json({ draft, mediaUrls, generated: false })
}

async function persistDraft(userId: string, draft: BundleDraft) {
  const saved: string[] = []
  for (const row of draft.entities ?? []) {
    const id = await upsertEntity(userId, row)
    if (id) saved.push(id)
  }
  return saved
}

async function upsertEntity(userId: string, row: BundleEntity): Promise<string | null> {
  const name = row.name?.trim()
  if (!name) return null
  const existing = await db.asset.findFirst({
    where: { ownerId: userId, kind: row.kind, label: name },
    select: { id: true, variations: true },
  })
  const variations = mergeVariations(existing?.variations, row.variations)
  if (existing) {
    await db.asset.update({
      where: { id: existing.id },
      data: {
        sourcePrompt: row.prompt || undefined,
        negativePrompt: row.negativePrompt || undefined,
        rules: row.rules || undefined,
        variations,
      },
    })
    return existing.id
  }
  const created = await db.asset.create({
    data: {
      ownerId: userId,
      kind: row.kind,
      label: name,
      sourcePrompt: row.prompt,
      negativePrompt: row.negativePrompt,
      rules: row.rules,
      variations,
      resolutionState: 'imported',
      usableAsReference: false,
      isPrimary: true,
      boundary: { source: 'bundle', file: row.sourceFile },
    },
    select: { id: true },
  })
  return created.id
}

function mergeVariations(current: unknown, incoming: string[]): string[] {
  const names = new Set<string>()
  if (Array.isArray(current)) {
    for (const item of current) {
      if (typeof item === 'string' && item.trim()) names.add(item.trim())
      else if (item && typeof item === 'object' && 'name' in item && typeof item.name === 'string') names.add(item.name)
    }
  }
  for (const name of incoming) if (name.trim()) names.add(name.trim())
  return [...names]
}
