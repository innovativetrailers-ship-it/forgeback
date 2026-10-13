import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import { entitlementCaller } from '@/lib/entitlement/desktopAccess'
import { linkExpired } from '@/lib/desktop/linkCode'
import { resolveEntitlement } from '@/lib/entitlement/resolve'
import { requireUser } from '@/lib/auth/requireUser'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const session = await auth()
  const userId = entitlementCaller({
    sessionUserId: session?.user?.id ?? null,
    tokenUserId: null,
    headerUserId: (await requireUser(req))?.id ?? null,
  })
  if (!userId) return NextResponse.json({ error: 'Sign in to approve this computer.' }, { status: 401 })
  const body = await req.json().catch((err) => {
    console.warn('[desktop-link] approve', err instanceof Error ? err.message : err)
    return null
  }) as { code?: string } | null
  const code = body?.code?.trim() ?? ''
  if (!code) return NextResponse.json({ error: 'Paste the code from the desktop app.' }, { status: 400 })
  const row = await db.desktopLinkCode.findUnique({ where: { code } })
  if (!row || row.consumedAt || linkExpired(row.expiresAt)) {
    return NextResponse.json({ error: 'That code has expired. Start again from the desktop app.' }, { status: 410 })
  }
  const entitlement = await resolveEntitlement(userId)
  if (!entitlement.canUseDesktop) {
    return NextResponse.json({
      error: 'Desktop needs an active Ultimate plan, a desktop subscription, or a desktop trial.',
      entitlement,
    }, { status: 402 })
  }
  const active = await db.desktopActivation.findMany({ where: { userId, revokedAt: null } })
  const mine = active.find((item) => item.deviceId === row.deviceId)
  if (!mine && active.length >= entitlement.seats) {
    return NextResponse.json({ error: 'This account is already active on another desktop.' }, { status: 409 })
  }
  const activation = mine
    ? await db.desktopActivation.update({
      where: { id: mine.id },
      data: { lastSeenAt: new Date(), deviceName: row.deviceName ?? mine.deviceName },
    })
    : await db.desktopActivation.create({
      data: { userId, deviceId: row.deviceId, deviceName: row.deviceName },
    })
  await db.desktopLinkCode.update({
    where: { id: row.id },
    data: { approvedAt: new Date(), userId },
  })
  const user = await db.user.findUnique({ where: { id: userId }, select: { email: true } })
  return NextResponse.json({
    approved: true,
    email: user?.email ?? session?.user?.email ?? null,
    deviceName: row.deviceName,
    internal: entitlement.internal,
  })
}
