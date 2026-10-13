import { NextRequest, NextResponse } from 'next/server'
import { denyUnlessCron } from '@/lib/cron-guard'
import { endpointDrift } from '@/lib/fal/schemaSync'
import { isGenerationPaused } from '@/lib/generation/pause'

export const runtime = 'nodejs'

export async function GET(req: NextRequest) {
  const denied = denyUnlessCron(req)
  if (denied) return denied

  if (isGenerationPaused()) {
    return NextResponse.json({
      ok: true,
      skipped: true,
      reason: 'GENERATION_PAUSED — endpoint drift uses free OpenAPI only',
      timestamp: new Date().toISOString(),
    })
  }

  try {
    const rows = await endpointDrift()
    const problems = rows.filter((r) => r.status !== 'ok')

    return NextResponse.json({
      ok: problems.length === 0,
      probed: rows.length,
      problems,
      rows,
      timestamp: new Date().toISOString(),
    }, { status: problems.length ? 503 : 200 })
  } catch (err) {
    console.error('[cron/endpoint-drift]', err)
    return NextResponse.json({ error: (err as Error).message }, { status: 500 })
  }
}
