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
    const meta = job.metadata as { text?: string } | null
    return NextResponse.json({
      jobId: job.id,
      status: job.status,
      outputUrl: job.outputUrl,
      text: meta?.text ?? null,
      error: job.errorMessage,
    })
  } catch (err) {
    console.warn('[relay] result', err instanceof Error ? err.message : err)
    if (err instanceof RelayRefused) return NextResponse.json({ error: err.message }, { status: 404 })
    return NextResponse.json({ error: 'Could not read the result.' }, { status: 500 })
  }
}
