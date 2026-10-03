import { type NextRequest, NextResponse } from 'next/server'
import { getProjectPresence, updatePresence } from '@/lib/collab/presence'
import { resolveCollabAccess } from '@/lib/collab/access'
import { broadcastCollab } from '@/lib/collab/hub'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const projectId = req.nextUrl.searchParams.get('projectId')
  if (!projectId) {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const access = await resolveCollabAccess(projectId, userId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  const presence = await getProjectPresence(projectId)
  return NextResponse.json({ presence, peers: presence })
}

export async function PATCH(req: NextRequest): Promise<NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const body: unknown = await req.json()
  if (!body || typeof body !== 'object') {
    return NextResponse.json({ error: 'Invalid body' }, { status: 400 })
  }

  const {
    projectId,
    displayName,
    avatarUrl,
    playheadTime,
    selectedClipId,
    typing,
    editing,
    cursor,
  } = body as Record<string, unknown>

  if (typeof projectId !== 'string') {
    return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
  }

  const access = await resolveCollabAccess(projectId, userId)
  if (!access) return NextResponse.json({ error: 'Forbidden' }, { status: 403 })

  await updatePresence(projectId, userId, {
    displayName: typeof displayName === 'string' ? displayName : undefined,
    avatarUrl: typeof avatarUrl === 'string' ? avatarUrl : avatarUrl === null ? null : undefined,
    playheadTime: typeof playheadTime === 'number' ? playheadTime : undefined,
    selectedClipId:
      typeof selectedClipId === 'string'
        ? selectedClipId
        : selectedClipId === null
          ? null
          : undefined,
    role: access.role,
    typing: typeof typing === 'boolean' ? typing : undefined,
    editing: editing && typeof editing === 'object' ? editing as PresenceState['editing'] : undefined,
    cursor: cursor && typeof cursor === 'object' ? cursor as PresenceState['cursor'] : undefined,
  })

  const peers = await getProjectPresence(projectId)
  broadcastCollab(projectId, { type: 'presence', peers })
  return NextResponse.json({ ok: true, presence: peers })
}

type PresenceState = import('@/lib/collab/presence').PresenceState
