import { NextRequest, NextResponse } from 'next/server'
import { addEntityVariation, loadEntityResolutions, loadProductionBreakdown } from '@/lib/studio/productionBoard'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const projectId = req.nextUrl.searchParams.get('projectId') ?? ''
  if (!projectId) return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  const breakdown = await loadProductionBreakdown(userId, projectId)
  if (!breakdown) return NextResponse.json({ breakdown: null, entities: [] })
  const entities = await loadEntityResolutions(userId, projectId, breakdown)
  return NextResponse.json({ breakdown, entities })
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[board] body', err instanceof Error ? err.message : err)
    return null
  }) as { projectId?: string; entityId?: string; label?: string; modifier?: string } | null
  if (!body?.projectId || !body.entityId || !body.label?.trim()) {
    return NextResponse.json({ error: 'projectId, entityId, and label are required' }, { status: 400 })
  }
  try {
    const breakdown = await addEntityVariation(userId, body.projectId, body.entityId, body.label, body.modifier ?? '')
    return NextResponse.json({ breakdown })
  } catch (err) {
    console.warn('[board] variation', err instanceof Error ? err.message : err)
    const message = err instanceof Error ? err.message : 'Could not add the variation'
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
