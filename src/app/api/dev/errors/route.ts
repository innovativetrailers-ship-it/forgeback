import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { errorAlerts, queryShotErrors, unknownErrorBucket } from '@/lib/diagnostics/query'
import { captureHealth } from '@/lib/diagnostics/captureFallback'
import { requireUser } from '@/lib/auth/requireUser'
import { diagnosticsBypassAllowed } from '@/lib/http/rateLimit'

async function requireDiagnostics(req: NextRequest): Promise<string | NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (diagnosticsBypassAllowed()) return userId
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return userId
}

export async function GET(req: NextRequest) {
  const auth = await requireDiagnostics(req)
  if (auth instanceof NextResponse) return auth
  const url = req.nextUrl
  const view = url.searchParams.get('view')
  if (view === 'unknown') return NextResponse.json({ unknown: await unknownErrorBucket() })
  if (view === 'alerts') return NextResponse.json(await errorAlerts())
  if (view === 'code') return NextResponse.json({ errors: await queryShotErrors({ category: 'code_error' }) })
  const sinceRaw = url.searchParams.get('since')
  const since = sinceRaw ? new Date(sinceRaw) : undefined
  const limitRaw = url.searchParams.get('limit')
  const limit = limitRaw ? Number(limitRaw) : undefined
  const rows = await queryShotErrors({
    model: url.searchParams.get('model') ?? undefined,
    category: url.searchParams.get('category') ?? undefined,
    mode: url.searchParams.get('mode') ?? undefined,
    endpoint: url.searchParams.get('endpoint') ?? undefined,
    since: since && !Number.isNaN(since.getTime()) ? since : undefined,
    limit: Number.isFinite(limit) ? limit : undefined,
  })
  return NextResponse.json({ errors: rows, captureHealth: captureHealth() })
}
