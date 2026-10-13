import { auth } from '@/lib/auth'
import { db } from '@/lib/db'
import {
  subscriptionPriceId,
  type BillingInterval,
} from '@/lib/payments/stripePrices'
import type { SubscriptionTier } from '@/lib/access/tiers'
import Stripe from 'stripe'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: '2026-04-22.dahlia' as any,
})

const PLAN_IDS = new Set(['pro', 'studio', 'ultimate'])

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as {
    priceId?: string
    tier?: string
    plan?: string
    billing?: BillingInterval
  }

  const tier = (body.tier ?? body.plan) as SubscriptionTier | undefined
  const billing: BillingInterval = body.billing === 'yearly' ? 'yearly' : 'monthly'

  let priceId = body.priceId
  if (!priceId && tier && PLAN_IDS.has(tier)) {
    priceId = subscriptionPriceId(tier as Exclude<SubscriptionTier, 'free' | 'admin'>, billing) ?? undefined
  }

  if (!priceId) {
    return Response.json({ error: 'Valid tier or priceId required' }, { status: 400 })
  }

  const user = await db.user.findUnique({
    where:  { id: session.user.id },
    select: { email: true, stripeCustomer: { select: { stripeCustomerId: true } } },
  })

  let customerId = user?.stripeCustomer?.stripeCustomerId
  if (!customerId) {
    const customer = await getStripe().customers.create({
      email: session.user.email ?? user?.email ?? undefined,
      metadata: { userId: session.user.id },
    })
    customerId = customer.id
    await db.stripeCustomer.upsert({
      where:  { userId: session.user.id },
      create: { userId: session.user.id, stripeCustomerId: customerId },
      update: { stripeCustomerId: customerId },
    })
  }

  const checkout = await getStripe().checkout.sessions.create({
    customer:              customerId,
    mode:                  'subscription',
    payment_method_types:  ['card'],
    line_items:            [{ price: priceId, quantity: 1 }],
    success_url:           `${process.env.NEXT_PUBLIC_APP_URL}/upgrade/success?tier=${tier ?? 'pro'}`,
    cancel_url:            `${process.env.NEXT_PUBLIC_APP_URL}/upgrade`,
    client_reference_id:   session.user.id,
    metadata:              { userId: session.user.id, tier: tier ?? '' },
    subscription_data:     { metadata: { userId: session.user.id, tier: tier ?? '' } },
    allow_promotion_codes: true,
    billing_address_collection: 'auto',
  })

  return Response.json({ url: checkout.url, checkoutUrl: checkout.url })
}
