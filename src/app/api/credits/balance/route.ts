import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { auth } from '@/lib/auth'
import { getEffectiveTier, resolveSubscriptionTier } from '@/lib/access/tiers'

export async function GET(req: NextRequest): Promise<NextResponse> {
  const session = await auth()
  const userId = req.headers.get('x-user-id') ?? session?.user?.id
  if (!userId) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where:  { id: userId },
    select: {
      role: true,
      creditBalance: true,
      subscriptionTier: true,
      subscriptionStatus: true,
    },
  })

  if (!user) return NextResponse.json({ error: 'User not found' }, { status: 404 })

  if (user.role === 'ADMIN') {
    return NextResponse.json({
      isAdmin:            true,
      credits:            9_999_999,
      unlimited:          true,
      subscriptionTier:   'admin',
      subscriptionStatus: 'active',
      tier:               'admin',
      effectiveTier:      'admin',
      message:            'Dev account — unlimited credits',
    })
  }

  let stripeBalanceUSD: number | null = null
  try {
    const { getStripeBalance } = await import('@/lib/payments/stripeCustomer')
    const stripeData = await getStripeBalance(userId)
    stripeBalanceUSD = stripeData?.balanceCents ? stripeData.balanceCents / 100 : null
  } catch (err) {
    console.warn("[caught] src/app/api/credits/balance/route.ts:41", err instanceof Error ? { name: err.name, message: err.message } : err)

    // Stripe optional
  }

  const tier = resolveSubscriptionTier(
    user.subscriptionTier,
    user.subscriptionStatus,
    user.role,
  )
  const effectiveTier = getEffectiveTier(tier, user.subscriptionStatus, false)

  return NextResponse.json({
    isAdmin:            false,
    credits:            user.creditBalance ?? 0,
    unlimited:          false,
    subscriptionTier:   user.subscriptionTier,
    subscriptionStatus: user.subscriptionStatus,
    tier,
    effectiveTier,
    stripeBalanceUSD,
  })
}
