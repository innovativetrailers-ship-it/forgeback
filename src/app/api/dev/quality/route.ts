import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { queryQualityLogs, qualityTrends, unexplainedQualityBucket } from '@/lib/diagnostics/qualityQuery'

async function requireDiagnostics(req: NextRequest): Promise<string | NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.DIAGNOSTICS_DEV === 'true') return userId
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return userId
}

export async function GET(req: NextRequest) {
  const auth = await requireDiagnostics(req)
  if (auth instanceof NextResponse) return auth
  const url = req.nextUrl
  const view = url.searchParams.get('view')
  if (view === 'unexplained') return NextResponse.json({ unexplained: await unexplainedQualityBucket() })
  if (view === 'trends') return NextResponse.json({ trends: await qualityTrends() })
  const sinceRaw = url.searchParams.get('since')
  const since = sinceRaw ? new Date(sinceRaw) : undefined
  const rows = await queryQualityLogs({
    model: url.searchParams.get('model') ?? undefined,
    purpose: url.searchParams.get('purpose') ?? undefined,
    dimension: url.searchParams.get('dimension') ?? undefined,
    source: url.searchParams.get('source') ?? undefined,
    verdict: url.searchParams.get('verdict') ?? undefined,
    since: since && !Number.isNaN(since.getTime()) ? since : undefined,
  })
  return NextResponse.json({ quality: rows })
}
