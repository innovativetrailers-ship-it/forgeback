import { NextRequest, NextResponse } from 'next/server'
import { validateDesktopCloudRequest } from '@/lib/desktop/cloudAuth'
import { RelayRefused } from '@/lib/billing/relayMeter'
import { relayJobForUser } from '@/lib/desktop/generateRelay'

export async function GET(request: NextRequest) {
  const userId = await validateDesktopCloudRequest(request)
  if (typeof userId !== 'string') return userId
  const jobId = new URL(request.url).searchParams.get('jobId') ?? ''
  try {
    const job = await relayJobForUser(userId, jobId)
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      error: job.errorMessage,
      estimate: (job.metadata as { estimate?: number } | null)?.estimate ?? null,
    })
  } catch (err) {
    console.warn('[relay] status', err instanceof Error ? err.message : err)
    if (err instanceof RelayRefused) return NextResponse.json({ error: err.message }, { status: 404 })
    return NextResponse.json({ error: 'Could not read the job.' }, { status: 500 })
  }
}
