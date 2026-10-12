import { NextRequest, NextResponse } from 'next/server'
import { patchBehavioral } from '@/lib/character/fccManager'
import { requireUserId } from '@/lib/character/auth'

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const userId = await requireUserId(request)
  if (userId instanceof NextResponse) return userId

  const { id } = await params
  const body = (await request.json()) as { prompt?: string }
  if (typeof body.prompt !== 'string') {
    return NextResponse.json({ error: 'prompt required' }, { status: 400 })
  }

  try {
    const view = await patchBehavioral(id, userId, body.prompt)
    return NextResponse.json(view)
  } catch (e) {
    console.warn("[caught] src/app/api/vault/character/[id]/behavioral/route.ts:21", e instanceof Error ? { name: e.name, message: e.message } : e)

    const message = e instanceof Error ? e.message : 'Update failed'
    return NextResponse.json({ error: message }, { status: 404 })
  }
}
