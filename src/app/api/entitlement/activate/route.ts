import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveEntitlement, signEntitlementToken } from '@/lib/entitlement/resolve'
import { requireUser } from '@/lib/auth/requireUser'

export async function POST(req: NextRequest) {
  const userId = (await requireUser(req))?.id ?? null
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[entitlement] activate body', err instanceof Error ? err.message : err)
    return null
  }) as { deviceId?: string; deviceName?: string } | null
  const deviceId = body?.deviceId?.trim()
  if (!deviceId) return NextResponse.json({ error: 'deviceId is required' }, { status: 400 })
  const entitlement = await resolveEntitlement(userId)
  if (!entitlement.canUseDesktop) {
    return NextResponse.json({
      entitled: false,
      reason: 'Desktop needs an active Ultimate plan, a desktop subscription, or a desktop trial.',
      entitlement,
    }, { status: 402 })
  }
  const active = await db.desktopActivation.findMany({
    where: { userId, revokedAt: null },
  })
  const mine = active.find((row) => row.deviceId === deviceId)
  if (!mine && active.length >= entitlement.seats) {
    return NextResponse.json({
      entitled: false,
      reason: 'This account is already active on another desktop.',
      devices: active.map((row) => ({ id: row.id, deviceName: row.deviceName, deviceId: row.deviceId })),
    }, { status: 409 })
  }
  const activation = mine
    ? await db.desktopActivation.update({ where: { id: mine.id }, data: { lastSeenAt: new Date(), deviceName: body?.deviceName ?? mine.deviceName } })
    : await db.desktopActivation.create({ data: { userId, deviceId, deviceName: body?.deviceName ?? null } })
  const token = signEntitlementToken({
    userId,
    plan: entitlement.plan,
    status: entitlement.status,
    canUseDesktop: true,
    internal: entitlement.internal,
    seat: activation.id,
    iat: Math.floor(Date.now() / 1000),
  })
  return NextResponse.json({ entitled: true, token, entitlement, activationId: activation.id })
}
