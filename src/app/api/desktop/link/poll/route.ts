import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { linkPollDecision } from '@/lib/desktop/linkCode'
import { resolveEntitlement, signEntitlementToken } from '@/lib/entitlement/resolve'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req.json().catch((err) => {
    console.warn('[desktop-link] poll', err instanceof Error ? err.message : err)
    return null
  }) as { code?: string; deviceId?: string } | null
  const code = body?.code?.trim() ?? ''
  const deviceId = body?.deviceId?.trim() ?? ''
  if (!code || !deviceId) return NextResponse.json({ status: 'expired' }, { status: 400 })
  const row = await db.desktopLinkCode.findUnique({ where: { code } })
  if (!row) return NextResponse.json({ status: 'expired' }, { status: 404 })
  const decision = linkPollDecision({
    deviceId,
    storedDeviceId: row.deviceId,
    expiresAt: row.expiresAt,
    consumedAt: row.consumedAt,
    approvedAt: row.approvedAt,
  })
  if (decision === 'device') return NextResponse.json({ status: 'device' }, { status: 403 })
  if (decision !== 'ready') return NextResponse.json({ status: decision })
  if (!row.userId) return NextResponse.json({ status: 'pending' })
  const entitlement = await resolveEntitlement(row.userId)
  if (!entitlement.canUseDesktop) {
    return NextResponse.json({ status: 'expired', reason: 'Desktop access is not active.' })
  }
  const activation = await db.desktopActivation.findFirst({
    where: { userId: row.userId, deviceId: row.deviceId, revokedAt: null },
  })
  const user = await db.user.findUnique({ where: { id: row.userId }, select: { email: true } })
  const token = signEntitlementToken({
    userId: row.userId,
    plan: entitlement.plan,
    status: entitlement.status,
    canUseDesktop: true,
    internal: entitlement.internal,
    seat: activation?.id ?? '',
    iat: Math.floor(Date.now() / 1000),
  })
  await db.desktopLinkCode.update({ where: { id: row.id }, data: { consumedAt: new Date() } })
  return NextResponse.json({
    status: 'ready',
    token,
    email: user?.email ?? null,
    internal: entitlement.internal,
  })
}
