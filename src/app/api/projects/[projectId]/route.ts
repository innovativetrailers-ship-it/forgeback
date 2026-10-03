import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'
import { isGenrePresetId } from '@cinema/core'
import { db } from '@/lib/db'

const patchSchema = z.object({
  gateMode: z.enum(['auto', 'manual', 'both']).optional(),
  styleLoraId: z.string().nullable().optional(),
  genrePresetId: z.string().nullable().optional(),
  title: z.string().min(1).optional(),
})

export async function GET(
  request: NextRequest,
  context: { params: Promise<unknown> },
) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId: id } = (await context.params) as { projectId: string }
  const project = await db.project.findUnique({
    where: { id },
    select: {
      id: true,
      userId: true,
      title: true,
      description: true,
      thumbnailUrl: true,
      timelineJson: true,
      durationSeconds: true,
      fps: true,
      resolution: true,
      status: true,
      isPublic: true,
      musicUrl: true,
      ambienceUrl: true,
      gateMode: true,
      styleLoraId: true,
      genrePresetId: true,
      createdAt: true,
      updatedAt: true,
    },
  })

  if (!project || project.userId !== userId) {
    return NextResponse.json({ error: 'Project not found' }, { status: 404 })
  }

  return NextResponse.json({
    ...project,
    name: project.title,
    recipe: project.timelineJson,
  })
}

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<unknown> },
) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId: id } = (await context.params) as { projectId: string }
  const body = patchSchema.parse(await request.json().catch((err) => {
    console.warn("[caught] src/app/api/projects/[id]/route.ts:64", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (({}))
  }))
  if (body.gateMode === undefined && body.styleLoraId === undefined && body.genrePresetId === undefined && body.title === undefined) {
    return NextResponse.json({ error: 'No project fields to update' }, { status: 400 })
  }

  const existing = await db.project.findFirst({
    where: { id, userId },
    select: { id: true },
  })
  if (!existing) return NextResponse.json({ error: 'Project not found' }, { status: 404 })

  if (body.styleLoraId) {
    const asset = await db.trainedAsset.findFirst({
      where: { id: body.styleLoraId, userId, deletedAt: null },
    })
    if (!asset) return NextResponse.json({ error: 'Style asset not found' }, { status: 400 })
  }

  if (body.genrePresetId && !isGenrePresetId(body.genrePresetId)) {
    return NextResponse.json({ error: 'Unknown genre preset' }, { status: 400 })
  }

  const project = await db.project.update({
    where: { id },
    data: {
      ...(body.gateMode ? { gateMode: body.gateMode } : {}),
      ...(body.styleLoraId !== undefined ? { styleLoraId: body.styleLoraId } : {}),
      ...(body.genrePresetId !== undefined ? { genrePresetId: body.genrePresetId } : {}),
      ...(body.title ? { title: body.title } : {}),
    },
    select: { id: true, gateMode: true, styleLoraId: true, genrePresetId: true, title: true },
  })
  return NextResponse.json(project)
}

