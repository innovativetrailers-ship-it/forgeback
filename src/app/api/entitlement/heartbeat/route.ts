import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveEntitlement, signEntitlementToken, verifyEntitlementToken } from '@/lib/entitlement/resolve'

/** Heartbeat carries the activation id, account id, and app version only. */
export async function POST(req: NextRequest) {
  const body = await req.json().catch((err) => {
    console.warn('[entitlement] heartbeat body', err instanceof Error ? err.message : err)
    return null
  }) as { token?: string; activationId?: string; appVersion?: string } | null
  const claims = body?.token ? verifyEntitlementToken(body.token) : null
  const userId = typeof claims?.userId === 'string' ? claims.userId : req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ entitled: false, reason: 'Sign in again.' }, { status: 401 })
  const entitlement = await resolveEntitlement(userId)
  if (body?.activationId) {
    await db.desktopActivation.updateMany({
      where: { id: body.activationId, userId, revokedAt: null },
      data: { lastSeenAt: new Date() },
    })
  }
  if (!entitlement.canUseDesktop) {
    return NextResponse.json({ entitled: false, reason: 'Desktop access is not active.', entitlement })
  }
  const token = signEntitlementToken({
    userId,
    plan: entitlement.plan,
    status: entitlement.status,
    canUseDesktop: true,
    seat: body?.activationId ?? '',
    iat: Math.floor(Date.now() / 1000),
    appVersion: body?.appVersion ?? null,
  })
  return NextResponse.json({ entitled: true, token, entitlement })
}
