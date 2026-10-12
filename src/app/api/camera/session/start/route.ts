import { type NextRequest, NextResponse } from 'next/server'
import { createCameraSession } from '@/lib/camera/WirelessIngest'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest): Promise<NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  let projectId: string
  try {
    const body = (await req.json()) as Record<string, unknown>
    if (typeof body.projectId !== 'string' || !body.projectId.trim())
      return NextResponse.json({ error: 'projectId is required' }, { status: 400 })
    projectId = body.projectId.trim()
  } catch (err) {
    console.warn("[caught] src/app/api/camera/session/start/route.ts:14", err instanceof Error ? { name: err.name, message: err.message } : err)

    return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  try {
    const session = await createCameraSession(projectId, userId)
    const appUrl = process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3000'
    const broadcastUrl = `${appUrl}/camera/${session.sessionId}?uid=${encodeURIComponent(userId)}`
    return NextResponse.json({ sessionId: session.sessionId, broadcastUrl }, { status: 201 })
  } catch (err: unknown) {
    console.error('[camera/session/start]', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Failed to create session' }, { status: 500 })
  }
}
