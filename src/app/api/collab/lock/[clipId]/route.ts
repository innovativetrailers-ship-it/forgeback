import { type NextRequest, NextResponse } from 'next/server'
import { lockClip, unlockClip, getOrCreateSession } from '@/lib/collab'

// POST — acquire lock on a clip
export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ clipId: string }> },
): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clipId } = await params

  let projectId: string
  try {
    const body = (await req.json()) as Record<string, unknown>
    if (typeof body.projectId !== 'string' || !body.projectId.trim())
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    projectId = body.projectId.trim()
  } catch (err) {
    console.warn("[caught] src/app/api/collab/lock/[clipId]/route.ts:20", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const acquired = lockClip(projectId, clipId, userId)

  if (acquired) {
    return NextResponse.json({ locked: true, lockedBy: userId })
  }

  const session = getOrCreateSession(projectId)
  const lockedBy = session.activeClipLocks.get(clipId) ?? 'unknown'
  return NextResponse.json({ locked: false, lockedBy }, { status: 409 })
}

// DELETE — release a clip lock
export async function DELETE(
  req: NextRequest,
  { params }: { params: Promise<{ clipId: string }> },
): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { clipId } = await params
  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId?.trim())
    return NextResponse.json({ error: 'projectId query param is required' }, { status: 400 })

  unlockClip(projectId.trim(), clipId, userId)
  return NextResponse.json({ released: true })
}
