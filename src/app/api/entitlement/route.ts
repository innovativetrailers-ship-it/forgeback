import { NextRequest, NextResponse } from 'next/server'
import { resolveEntitlement } from '@/lib/entitlement/resolve'
import { requireUser } from '@/lib/auth/requireUser'

export async function GET(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const entitlement = await resolveEntitlement(userId)
  return NextResponse.json({ entitlement })
}
