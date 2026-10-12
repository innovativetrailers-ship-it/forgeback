import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { captureCodeError, codeErrorStats } from '@/lib/diagnostics/captureCode'
import { queryShotErrors } from '@/lib/diagnostics/query'
import { requireUser } from '@/lib/auth/requireUser'

async function requireDiagnostics(req: NextRequest): Promise<string | NextResponse> {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.DIAGNOSTICS_DEV === 'true') return userId
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role !== 'ADMIN' && req.method === 'GET') {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  }
  return userId
}

export async function GET(req: NextRequest) {
  const auth = await requireDiagnostics(req)
  if (auth instanceof NextResponse) return auth
  const view = req.nextUrl.searchParams.get('view')
  if (view === 'stats') return NextResponse.json(await codeErrorStats())
  const rows = await queryShotErrors({ category: 'code_error' })
  return NextResponse.json({ errors: rows })
}

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn("[caught] src/app/api/dev/code/route.ts:29", err instanceof Error ? { name: err.name, message: err.message } : err)
    return (({}))
  }) as { rawError?: unknown; source?: unknown }
  const rawError = typeof body.rawError === 'string' ? body.rawError : ''
  if (!rawError.trim()) return NextResponse.json({ error: 'rawError is required' }, { status: 400 })
  const id = await captureCodeError({
    rawError,
    userId,
    source: typeof body.source === 'string' ? body.source : 'browser',
  })
  return NextResponse.json({ id })
}
