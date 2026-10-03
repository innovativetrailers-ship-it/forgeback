import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { resolveEntitlement } from '@/lib/entitlement/resolve'

export async function POST(req: NextRequest) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  const user = await db.user.findUnique({ where: { id: userId }, select: { hasUsedDesktopTrial: true } })
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  if (user.hasUsedDesktopTrial) {
    return NextResponse.json({ error: 'This account already used its desktop trial' }, { status: 409 })
  }
  const current = await resolveEntitlement(userId)
  if (current.canUseDesktop) {
    return NextResponse.json({ error: 'Desktop access is already on' }, { status: 409 })
  }
  const currentPeriodEnd = new Date(Date.now() + 30 * 86_400_000)
  await db.subscription.create({
    data: {
      userId,
      provider: 'trial',
      providerSubId: `trial-${userId}`,
      plan: 'desktop',
      status: 'trialing',
      currentPeriodEnd,
      seats: 1,
    },
  })
  await db.user.update({ where: { id: userId }, data: { hasUsedDesktopTrial: true } })
  const entitlement = await resolveEntitlement(userId)
  return NextResponse.json({ entitlement })
}
