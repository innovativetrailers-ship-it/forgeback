import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { savePlaybook } from '@/lib/playbook'
import { requireUser } from '@/lib/auth/requireUser'

export async function PATCH(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params
  const existing = await db.playbook.findFirst({ where: { id, userId } })
  if (!existing) return NextResponse.json({ error: 'Playbook not found' }, { status: 404 })
  const body = await request.json().catch((err) => {
    console.warn("[caught] src/app/api/playbooks/[id]/route.ts:14", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (({}))
  }) as {
    name?: string
    projectId?: string | null
    style?: unknown
    generation?: unknown
    language?: unknown
    rules?: string[]
  }
  try {
    const playbook = await savePlaybook({
      userId,
      id,
      name: typeof body.name === 'string' ? body.name : existing.name,
      projectId: body.projectId === undefined ? existing.projectId : body.projectId,
      style: (body.style as never) ?? existing.style as never,
      generation: (body.generation as never) ?? existing.generation as never,
      language: (body.language as never) ?? existing.language as never,
      rules: Array.isArray(body.rules) ? body.rules.filter((r): r is string => typeof r === 'string') : existing.rules,
    })
    return NextResponse.json({ playbook })
  } catch (err) {
    console.warn("[caught] src/app/api/playbooks/[id]/route.ts:34", err instanceof Error ? { name: err.name, message: err.message } : err)

    const message = err instanceof Error ? err.message : 'Could not save playbook'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  const userId = (await requireUser(request))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const { id } = await context.params
  const existing = await db.playbook.findFirst({ where: { id, userId }, select: { id: true } })
  if (!existing) return NextResponse.json({ error: 'Playbook not found' }, { status: 404 })
  await db.playbook.delete({ where: { id } })
  return NextResponse.json({ ok: true })
}
