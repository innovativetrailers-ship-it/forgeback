import { logCaught } from '@/lib/diagnostics/caught'
import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveCollabAccess, assertCanEditDoc } from '@/lib/collab/access'
import { applyAndBroadcastDoc } from '@/lib/collab/doc'

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> }
) {
  const userId = request.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { projectId: id } = await params
  const body = await request.json().catch((err) => {
    console.warn("[caught] src/app/api/projects/[id]/save/route.ts:15", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (({}))
  })
  const { recipe } = body

  try {
    const existing = await db.project.findUnique({ where: { id }, select: { userId: true } })
    const access = existing ? await resolveCollabAccess(id, userId) : null
    if (existing && !access) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }
    if (access && !assertCanEditDoc(access)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
    }

    const durationSeconds =
      recipe && typeof recipe.durationSeconds === 'number' ? recipe.durationSeconds : undefined
    const fps = recipe && typeof recipe.fps === 'number' ? recipe.fps : undefined
    const resolution =
      recipe?.resolution && typeof recipe.resolution.width === 'number'
        ? `${recipe.resolution.width}x${recipe.resolution.height}`
        : undefined

    const updated = await db.project.upsert({
      where: { id },
      create: {
        id,
        userId,
        title: 'Untitled project',
        timelineJson: recipe ?? undefined,
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        ...(fps !== undefined ? { fps } : {}),
        ...(resolution ? { resolution } : {}),
      },
      update: {
        timelineJson: recipe ?? undefined,
        updatedAt: new Date(),
        ...(durationSeconds !== undefined ? { durationSeconds } : {}),
        ...(fps !== undefined ? { fps } : {}),
        ...(resolution ? { resolution } : {}),
      },
    })

    if (recipe && existing) {
      await applyAndBroadcastDoc({ projectId: id, actor: userId, recipe }).catch((err) => logCaught('app/api/projects/[id]/save/route', err))
    }

    return NextResponse.json({ project: updated })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Failed to save project'
    console.error('[projects/save]', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
