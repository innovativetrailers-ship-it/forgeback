import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { claimMismatches, queryDeadControls, registrySummary } from '@/lib/diagnostics/controlRegistry'
import { isControlStatus, type ControlSystem, CONTROL_SYSTEMS } from '@cinema/core'
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

function asSystem(value: string | null): ControlSystem | undefined {
  if (!value) return undefined
  return (CONTROL_SYSTEMS as readonly string[]).includes(value) ? value as ControlSystem : undefined
}

export async function GET(req: NextRequest) {
  const auth = await requireDiagnostics(req)
  if (auth instanceof NextResponse) return auth
  const url = req.nextUrl
  const view = url.searchParams.get('view')
  if (view === 'claims') return NextResponse.json({ claims: claimMismatches() })
  if (view === 'summary') return NextResponse.json(registrySummary())
  const system = asSystem(url.searchParams.get('system'))
  const dead = queryDeadControls(system)
  const status = url.searchParams.get('status')
  if (status && isControlStatus(status)) {
    return NextResponse.json({
      ...dead,
      inventory: dead.inventory.filter((row) => row.status === status),
    })
  }
  return NextResponse.json(dead)
}
