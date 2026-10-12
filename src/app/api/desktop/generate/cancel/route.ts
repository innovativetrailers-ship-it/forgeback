import { NextRequest, NextResponse } from 'next/server'
import { validateDesktopCloudRequest } from '@/lib/desktop/cloudAuth'
import { RelayRefused } from '@/lib/billing/relayMeter'
import { cancelGenerateRelay } from '@/lib/desktop/generateRelay'

export async function POST(request: NextRequest) {
  const userId = await validateDesktopCloudRequest(request)
  if (typeof userId !== 'string') return userId
  const body = await request.json().catch((err) => {
    console.warn('[relay] cancel body', err instanceof Error ? err.message : err)
    return null
  }) as { jobId?: unknown } | null
  if (!body || typeof body.jobId !== 'string') {
    return NextResponse.json({ error: 'Job not found.' }, { status: 400 })
  }
  try {
    await cancelGenerateRelay(userId, body.jobId)
    return NextResponse.json({ ok: true })
  } catch (err) {
    console.warn('[relay] cancel', err instanceof Error ? err.message : err)
    if (err instanceof RelayRefused) return NextResponse.json({ error: err.message }, { status: 404 })
    return NextResponse.json({ error: 'Could not cancel the job.' }, { status: 500 })
  }
}
