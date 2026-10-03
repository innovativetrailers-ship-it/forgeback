import { NextRequest, NextResponse } from 'next/server'
import { clearEpisodic, readPrivacy, writePrivacy } from '@/lib/privacy/gate'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const privacy = await readPrivacy(userId)
  return NextResponse.json({
    privacy,
    notes: {
      episodic: 'On: creative decisions are remembered and recalled. Off: they are not read or written.',
      project: 'On: project search context can inform a run. Off: that search context is not read.',
    },
  })
}

export async function PATCH(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[privacy] body', err instanceof Error ? err.message : err)
    return null
  }) as { episodic?: boolean; project?: boolean; clear?: 'episodic' } | null
  if (body?.clear === 'episodic') {
    await clearEpisodic(userId)
    return NextResponse.json({ cleared: 'episodic', privacy: await readPrivacy(userId) })
  }
  try {
    const privacy = await writePrivacy(userId, {
      ...(typeof body?.episodic === 'boolean' ? { episodic: body.episodic } : {}),
      ...(typeof body?.project === 'boolean' ? { project: body.project } : {}),
    })
    return NextResponse.json({ privacy })
  } catch (err) {
    console.warn('[privacy] write', err instanceof Error ? err.message : err)
    return NextResponse.json({ error: 'Privacy settings are not stored yet' }, { status: 503 })
  }
}
