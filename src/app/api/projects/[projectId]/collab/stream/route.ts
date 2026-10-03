import { NextRequest } from 'next/server'
import { auth } from '@/lib/auth'
import { resolveCollabAccess } from '@/lib/collab/access'
import { subscribeCollab, collabStreamHeaders } from '@/lib/collab/hub'
import { getProjectPresence } from '@/lib/collab/presence'
import { loadCollabDocument } from '@/lib/collab/doc'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 300

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ projectId: string }> },
) {
  const session = await auth()
  const userId = request.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return new Response('Unauthorized', { status: 401 })

  const { projectId } = await params
  const access = await resolveCollabAccess(projectId, userId)
  if (!access) return new Response('Forbidden', { status: 403 })

  const peers = await getProjectPresence(projectId)
  const doc = await loadCollabDocument(projectId)
  const stream = subscribeCollab(projectId, {
    type: 'hello',
    peers,
    docClock: doc.docClock,
    recipe: doc.recipe,
  }, request.signal)

  return new Response(stream, { headers: collabStreamHeaders() })
}
