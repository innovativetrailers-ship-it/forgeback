import { NextRequest, NextResponse } from 'next/server'
import { validateDesktopCloudRequest } from '@/lib/desktop/cloudAuth'
import { RelayRefused } from '@/lib/billing/relayMeter'
import { submitGenerateRelay } from '@/lib/desktop/generateRelay'

export async function POST(request: NextRequest) {
  const userId = await validateDesktopCloudRequest(request)
  if (typeof userId !== 'string') return userId
  const body = await request.json().catch((err) => {
    console.warn('[relay] submit body', err instanceof Error ? err.message : err)
    return null
  }) as { endpointKey?: unknown; input?: unknown; source?: unknown } | null
  if (!body || typeof body.endpointKey !== 'string') {
    return NextResponse.json({ error: 'Choose a model.' }, { status: 400 })
  }
  const input = body.input && typeof body.input === 'object' && !Array.isArray(body.input)
    ? body.input as Record<string, unknown>
    : {}
  const source = typeof body.source === 'string' && body.source.trim() ? body.source.trim() : 'desktop.relay'
  try {
    return NextResponse.json(await submitGenerateRelay(userId, body.endpointKey, input, source))
  } catch (err) {
    console.warn('[relay] submit', err instanceof Error ? err.message : err)
    if (err instanceof RelayRefused) {
      const status = /credits/i.test(err.message) ? 402 : 403
      return NextResponse.json({ error: err.message }, { status })
    }
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Could not start the job.' }, { status: 500 })
  }
}
