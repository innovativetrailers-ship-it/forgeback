import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { deleteFromR2, objectKeyFromStored } from '@/lib/storage/r2'

const moveSchema = z.object({
  projectId: z.string().min(1),
  itemId: z.string().min(1),
  folderId: z.string().min(1),
})

const deleteSchema = z.object({
  projectId: z.string().min(1),
  itemId: z.string().min(1),
  confirmPlaced: z.boolean().default(false),
})

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = moveSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid move' }, { status: 400 })
  const folder = await db.mediaFolder.findFirst({
    where: { id: parsed.data.folderId, projectId: parsed.data.projectId, project: { userId } },
  })
  if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  const item = await db.asset.findFirst({ where: { id: parsed.data.itemId, ownerId: userId } })
  if (!item) return NextResponse.json({ error: 'Library item not found' }, { status: 404 })
  await db.asset.update({ where: { id: item.id }, data: { folderId: folder.id } })
  return NextResponse.json({ id: item.id, folderId: folder.id })
}

export async function DELETE(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = deleteSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid delete' }, { status: 400 })
  const item = await db.asset.findFirst({ where: { id: parsed.data.itemId, ownerId: userId } })
  if (!item) return NextResponse.json({ error: 'Library item not found' }, { status: 404 })
  if (!parsed.data.confirmPlaced) {
    return NextResponse.json({
      needsConfirm: true,
      message: 'Deleting this take removes it from the library and from any timeline slot that references it.',
    })
  }
  const key = item.sourceRefs.map((ref) => objectKeyFromStored(ref)).find((ref): ref is string => Boolean(ref))
  if (key) {
    await deleteFromR2(key).catch((err) => {
      console.warn('[library] storage delete failed', err instanceof Error ? err.message : err)
    })
  }
  await db.asset.delete({ where: { id: item.id } })
  return NextResponse.json({ id: item.id })
}
