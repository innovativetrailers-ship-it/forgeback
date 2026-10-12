import { NextRequest, NextResponse } from 'next/server'
import { resolveCollabAccess, assertCanEditDoc } from '@/lib/collab/access'
import { applyAndBroadcastDoc, loadCollabDocument } from '@/lib/collab/doc'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId } = await params
  const access = await resolveCollabAccess(projectId, userId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  const doc = await loadCollabDocument(projectId)
  return NextResponse.json({ doc })
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { projectId } = await params
  const access = await resolveCollabAccess(projectId, userId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  if (!assertCanEditDoc(access)) {
    return NextResponse.json({ error: 'Role cannot edit this project' }, { status: 403 })
  }

  const body = await request.json().catch((err) => {
    console.warn("[caught] src/app/api/projects/[id]/collab/doc/route.ts:31", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (({}))
  }) as Record<string, unknown>
  const merged = await applyAndBroadcastDoc({
    projectId,
    actor: userId,
    recipe: body.recipe,
    script: typeof body.script === 'string' ? body.script : undefined,
    cast: Array.isArray(body.cast) ? body.cast as { id: string; name: string }[] : undefined,
    shotPlan: Array.isArray(body.shotPlan) ? body.shotPlan as { id: string; prompt?: string; duration?: number }[] : undefined,
    playbookId: body.playbookId === null || typeof body.playbookId === 'string' ? (body.playbookId as string | null) : undefined,
  })
  return NextResponse.json({
    docClock: merged.doc.docClock,
    warnings: merged.warnings,
    recipe: merged.doc.recipe,
    script: merged.doc.script.value,
  })
}
