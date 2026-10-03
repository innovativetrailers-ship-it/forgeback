import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { shotLifecycle } from '@/lib/diagnostics/query'

async function requireDiagnostics(req: NextRequest): Promise<string | NextResponse> {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (process.env.DIAGNOSTICS_DEV === 'true') return userId
  const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
  if (user?.role !== 'ADMIN') return NextResponse.json({ error: 'Forbidden' }, { status: 403 })
  return userId
}

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ shotId: string }> },
) {
  const auth = await requireDiagnostics(req)
  if (auth instanceof NextResponse) return auth
  const { shotId } = await params
  return NextResponse.json(await shotLifecycle(shotId))
}
