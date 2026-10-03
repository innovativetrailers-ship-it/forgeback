import { NextRequest, NextResponse } from 'next/server'
import { resolveEntitlement } from '@/lib/entitlement/resolve'

export async function GET(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const entitlement = await resolveEntitlement(userId)
  return NextResponse.json({ entitlement })
}
