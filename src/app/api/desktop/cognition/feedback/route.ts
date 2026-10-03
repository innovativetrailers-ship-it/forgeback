import { logCaught } from '@/lib/diagnostics/caught'
import { type NextRequest, NextResponse } from 'next/server'
import { updateRoutingPolicy } from '@/lib/cognition/memory/procedural'
import { validateDesktopCloudRequest } from '@/lib/desktop/cloudAuth'

const REWARD_MAP: Record<string, number> = {
  export: 1.0,
  watch_complete: 0.5,
  thumbs_up: 0.8,
  regenerate: -1.0,
  discard: -0.5,
  thumbs_down: -0.8,
}

export async function POST(request: NextRequest): Promise<NextResponse> {
  const userId = validateDesktopCloudRequest(request)
  if (userId instanceof NextResponse) return userId

  const body = (await request.json()) as {
    signal?: string
    model?: string
    contentType?: string
  }

  const signal = body.signal ?? ''
  const reward = REWARD_MAP[signal]
  if (reward == null) return NextResponse.json({ error: 'Unknown signal' }, { status: 400 })

  if (body.model && body.contentType) {
    await updateRoutingPolicy(body.contentType, body.model, reward > 0 ? 0.8 : 0.3, 30).catch((err) => logCaught('app/api/desktop/cognition/feedback/route', err))
  }

  return NextResponse.json({ ok: true, reward })
}
