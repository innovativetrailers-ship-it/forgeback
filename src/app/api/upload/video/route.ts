import { NextRequest, NextResponse } from 'next/server'
import { uploadToR2 } from '@/lib/storage/r2'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { ensureMainFolder } from '@/lib/library/folders'
import { requireUser } from '@/lib/auth/requireUser'

const MAX_SIZE = 500 * 1024 * 1024 // 500MB

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('video') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (!file.type.startsWith('video/')) return NextResponse.json({ error: 'Invalid file type' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 500MB)' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const ext = file.name.split('.').pop() ?? 'mp4'
  const key = `uploads/${userId}/videos/${nanoid()}.${ext}`

  const storedUrl = await uploadToR2(buffer, key, file.type)
  const id = nanoid()
  const projectId = String(formData.get('projectId') ?? '')
  const folder = projectId
    ? await ensureMainFolder(projectId).catch((err) => {
      console.warn('[upload] main folder', err instanceof Error ? err.message : err)
      return null
    })
    : null
  await db.asset.create({
    data: {
      id,
      ownerId: userId,
      kind: 'asset',
      sourcePrompt: file.name,
      sourceRefs: [key],
      generatedImage: null,
      usableAsReference: true,
      mediaKind: 'imported',
      label: file.name,
      folderId: folder?.id,
      contentType: file.type || 'video/mp4',
    },
  })
  return NextResponse.json({
    id,
    storageKey: key,
    url: storedUrl,
    mediaPath: `/api/media/${id}`,
    folderId: folder?.id ?? null,
    kind: 'imported',
  })
}
