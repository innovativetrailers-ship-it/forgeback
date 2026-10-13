import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { db } from '@/lib/db'
import { ensureMainFolder } from '@/lib/library/folders'
import { requireUser } from '@/lib/auth/requireUser'

const createSchema = z.object({
  projectId: z.string().min(1),
  name: z.string().min(1).max(80),
  parentId: z.string().nullable().optional(),
})

const renameSchema = z.object({
  projectId: z.string().min(1),
  folderId: z.string().min(1),
  name: z.string().min(1).max(80),
})

const deleteSchema = z.object({
  projectId: z.string().min(1),
  folderId: z.string().min(1),
})

async function ownedProject(userId: string, projectId: string) {
  return db.project.findFirst({ where: { id: projectId, userId }, select: { id: true } })
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = createSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid folder' }, { status: 400 })
  if (!(await ownedProject(userId, parsed.data.projectId))) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  const main = await ensureMainFolder(parsed.data.projectId)
  const folder = await db.mediaFolder.create({
    data: {
      projectId: parsed.data.projectId,
      name: parsed.data.name.trim(),
      kind: 'custom',
      parentId: parsed.data.parentId || main.id,
      order: 2,
    },
  })
  return NextResponse.json({ folder })
}

export async function PATCH(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = renameSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid rename' }, { status: 400 })
  if (!(await ownedProject(userId, parsed.data.projectId))) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  const folder = await db.mediaFolder.findFirst({
    where: { id: parsed.data.folderId, projectId: parsed.data.projectId },
  })
  if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  if (folder.kind === 'main') return NextResponse.json({ error: 'The main folder keeps its name' }, { status: 400 })
  const updated = await db.mediaFolder.update({
    where: { id: folder.id },
    data: { name: parsed.data.name.trim() },
  })
  return NextResponse.json({ folder: updated })
}

export async function DELETE(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const parsed = deleteSchema.safeParse(await req.json())
  if (!parsed.success) return NextResponse.json({ error: 'Invalid delete' }, { status: 400 })
  if (!(await ownedProject(userId, parsed.data.projectId))) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }
  const folder = await db.mediaFolder.findFirst({
    where: { id: parsed.data.folderId, projectId: parsed.data.projectId },
  })
  if (!folder) return NextResponse.json({ error: 'Folder not found' }, { status: 404 })
  if (folder.kind === 'main') return NextResponse.json({ error: 'The main folder cannot be deleted' }, { status: 400 })
  const main = await ensureMainFolder(parsed.data.projectId)
  await db.asset.updateMany({
    where: { folderId: folder.id, ownerId: userId },
    data: { folderId: main.id },
  })
  await db.mediaFolder.updateMany({
    where: { parentId: folder.id },
    data: { parentId: main.id },
  })
  await db.mediaFolder.delete({ where: { id: folder.id } })
  return NextResponse.json({ movedTo: main.id })
}
