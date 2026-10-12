import { NextRequest, NextResponse } from 'next/server'
import { uploadToR2 } from '@/lib/storage/r2'
import { nanoid } from 'nanoid'
import { db } from '@/lib/db'
import { ensureMainFolder, ensureSceneFolder } from '@/lib/library/folders'
import { isLibraryKind } from '@/lib/library/model'
import { requireUser } from '@/lib/auth/requireUser'
import { opaqueObjectKey, sniffMedia } from '@/lib/upload/sniff'

const MAX_SIZE = 100 * 1024 * 1024 // 100MB

export async function POST(request: NextRequest) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData()
  const file = formData.get('audio') as File | null

  if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 100MB)' }, { status: 400 })

  const buffer = Buffer.from(await file.arrayBuffer())
  const sniffed = sniffMedia(buffer)
  if (!sniffed || !sniffed.mime.startsWith('audio/')) {
    return NextResponse.json({ error: 'File contents are not an allowed audio file' }, { status: 400 })
  }
  const key = opaqueObjectKey(sniffed.ext)

  const url = await uploadToR2(buffer, key, sniffed.mime)
  const libraryKind = String(formData.get('library') ?? '')
  const projectId = String(formData.get('projectId') ?? '')
  if (!isLibraryKind(libraryKind) || !projectId) {
    return NextResponse.json({ url })
  }
  const sceneId = String(formData.get('sceneId') ?? '')
  const folder = sceneId
    ? await ensureSceneFolder(projectId, sceneId, String(formData.get('sceneName') ?? 'Scene'))
    : await ensureMainFolder(projectId)
  const id = nanoid()
  await db.asset.create({
    data: {
      id,
      ownerId: userId,
      kind: 'asset',
      sourceRefs: [key],
      mediaKind: libraryKind,
      label: file.name,
      folderId: folder.id,
      contentType: file.type,
      usableAsReference: false,
    },
  })
  return NextResponse.json({ url, id, mediaPath: `/api/media/${id}`, folderId: folder.id, kind: libraryKind })
}
