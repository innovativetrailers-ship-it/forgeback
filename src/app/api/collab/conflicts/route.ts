import { type NextRequest, NextResponse } from 'next/server'
import { getUnresolvedConflicts, markResolved, type ConflictResolution } from '@/lib/collab/conflict'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const conflicts = await getUnresolvedConflicts(projectId)
  return NextResponse.json({ conflicts })
}

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: unknown = await req.json()
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const { conflictId, resolution } = body as Record<string, unknown>

  if (typeof conflictId !== 'string') {
    return NextResponse.json({ error: 'conflictId is required' }, { status: 400 })
  }

  const validResolutions: ConflictResolution[] = ['user1_wins', 'user2_wins', 'merged']
  if (!validResolutions.includes(resolution as ConflictResolution)) {
    return NextResponse.json(
      { error: 'resolution must be one of: user1_wins, user2_wins, merged' },
      { status: 400 },
    )
  }

  await markResolved(conflictId, resolution as Exclude<ConflictResolution, null>)
  return NextResponse.json({ ok: true })
}
