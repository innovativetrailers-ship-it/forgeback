import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { objectKeyFromStored } from '@/lib/storage/r2'
import { createLibraryAsset, listLibrary } from '@/lib/library/folders'
import { isLibraryKind } from '@/lib/library/model'

const fromJob = z.object({
  intent: z.literal('placement'),
  projectId: z.string().min(1),
  jobId: z.string().min(1),
  label: z.string().min(1).max(200),
  kind: z.enum(['video', 'imported', 'music', 'voice']).default('video'),
})

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const projectId = req.nextUrl.searchParams.get('projectId') ?? ''
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  try {
    return NextResponse.json(await listLibrary(userId, projectId))
  } catch (err) {
    console.warn('[library] list failed', err instanceof Error ? err.message : err)
    const message = err instanceof Error ? err.message : 'Library unavailable'
    return NextResponse.json({ error: message }, { status: 404 })
  }
}

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = fromJob.safeParse(await req.json())
  if (!parsed.success) {
    return NextResponse.json({ error: 'A finished clip is placed in the library. Entity references use the pre-production board.' }, { status: 400 })
  }
  const project = await db.project.findFirst({ where: { id: parsed.data.projectId, userId }, select: { id: true } })
  if (!project) return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  const job = await db.renderJob.findFirst({
    where: { id: parsed.data.jobId, userId },
    select: { storageKey: true, outputUrl: true },
  })
  const key = job?.storageKey?.trim() || objectKeyFromStored(job?.outputUrl)
  if (!key || !isLibraryKind(parsed.data.kind)) {
    return NextResponse.json({ error: 'Completed media has no stored file' }, { status: 400 })
  }
  const item = await createLibraryAsset({
    userId,
    projectId: parsed.data.projectId,
    kind: parsed.data.kind,
    storageKey: key,
    label: parsed.data.label,
  })
  return NextResponse.json({ item })
}
