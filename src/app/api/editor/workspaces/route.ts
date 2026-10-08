import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const rows = await db.editorWorkspace.findMany({ where: { userId }, orderBy: { name: 'asc' } })
  return NextResponse.json({
    workspaces: rows.map((row) => ({
      name: row.name,
      timelineMode: row.timelineMode,
      layout: row.layout,
      updatedAt: row.updatedAt.toISOString(),
    })),
  })
}

export async function PUT(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[workspace]', err instanceof Error ? err.message : err)
    return null
  }) as { name?: string; timelineMode?: string; layout?: unknown; updatedAt?: string; reset?: boolean } | null
  const name = body?.name?.trim()
  if (!name) return NextResponse.json({ error: 'name required' }, { status: 400 })
  const existing = await db.editorWorkspace.findUnique({ where: { userId_name: { userId, name } } })
  const incoming = body?.updatedAt ? new Date(body.updatedAt) : new Date()
  if (existing && !body?.reset && existing.updatedAt > incoming) {
    return NextResponse.json({
      kept: 'server',
      workspace: { name: existing.name, timelineMode: existing.timelineMode, layout: existing.layout, updatedAt: existing.updatedAt.toISOString() },
    })
  }
  const row = await db.editorWorkspace.upsert({
    where: { userId_name: { userId, name } },
    create: { userId, name, timelineMode: body?.timelineMode || 'full', layout: body?.reset ? undefined : (body?.layout as object | undefined) },
    update: { timelineMode: body?.timelineMode || 'full', layout: body?.reset ? undefined : (body?.layout as object | undefined) },
  })
  return NextResponse.json({
    kept: 'client',
    workspace: { name: row.name, timelineMode: row.timelineMode, layout: row.layout, updatedAt: row.updatedAt.toISOString() },
  })
}
