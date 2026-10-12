import { stripe, usdCentsToCredits } from '@/lib/payments/stripe'
import { db } from '@/lib/db'
import {
  STRIPE_CREDIT_PACK_PRICES,
  STRIPE_PRICE_TO_TIER,
  SUBSCRIPTION_PLAN_CREDITS,
} from '@/lib/payments/stripePrices'
import { hasStripeSignature } from '@/lib/payments/stripeWebhook'
import { subscriptionCreditData } from '@/lib/billing/relayMeter'
import { upsertSubscription } from '@/lib/entitlement/resolve'
import type { SubscriptionTier } from '@/lib/access/tiers'

export const runtime = 'nodejs'

export async function POST(req: Request) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature')
  if (!hasStripeSignature(signature)) {
    return Response.json({ error: 'Missing stripe-signature' }, { status: 400 })
  }

  let event: ReturnType<typeof stripe.webhooks.constructEvent>
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Stripe Webhook] Invalid signature:', msg)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

  const already = await db.processedStripeEvent.findUnique({ where: { eventId: event.id } })
  if (already) return Response.json({ received: true })

  switch (event.type) {

    case 'payment_intent.succeeded': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pi     = event.data.object as any
      const userId = pi.metadata?.userId as string | undefined
      if (!userId || pi.metadata?.purpose !== 'credit_deposit') break

      const vendorCents = parseInt(pi.metadata.vendorCents ?? '0')
      const credits     = usdCentsToCredits(vendorCents)

      await db.$transaction([
        db.stripeDeposit.update({
          where: { paymentIntentId: pi.id },
          data:  { status: 'completed' },
        }),
        db.user.update({
          where: { id: userId },
          data:  { creditBalance: { increment: credits } },
        }),
      ])

      const record = await db.stripeCustomer.findUnique({ where: { userId } })
      if (record) {
        await stripe.customers.update(record.stripeCustomerId, {
          balance: -(vendorCents),
        })
        await db.stripeCustomer.update({
          where: { userId },
          data: {
            stripeBalanceCents:   { increment: vendorCents },
            lifetimeDepositCents: { increment: pi.amount },
          },
        })
      }

      const updatedUser = await db.user.findUnique({
        where:  { id: userId },
        select: { creditBalance: true },
      })
      await db.creditTransaction.create({
        data: {
          userId,
          amount:      credits,
          description: `Deposit: $${pi.amount / 100}`,
          balanceAfter: updatedUser?.creditBalance ?? credits,
        },
      })

      console.log(`[Stripe] Deposit: $${pi.amount / 100} → ${credits} credits for ${userId}`)
      break
    }

    case 'payment_intent.payment_failed': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const pi     = event.data.object as any
      const userId = pi.metadata?.userId as string | undefined
      if (userId) {
        await db.stripeDeposit.update({
          where: { paymentIntentId: pi.id },
          data:  { status: 'failed' },
        })
      }
      break
    }

    case 'charge.refunded': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const charge = event.data.object as any
      const pi     = await stripe.paymentIntents.retrieve(charge.payment_intent as string)
      const userId = pi.metadata?.userId as string | undefined
      if (!userId) break

      const refundedCents = charge.amount_refunded as number
      const credits       = usdCentsToCredits(refundedCents)

      await db.$transaction([
        db.user.update({ where: { id: userId }, data: { creditBalance: { decrement: credits } } }),
        db.stripeDeposit.updateMany({ where: { paymentIntentId: pi.id }, data: { status: 'refunded' } }),
      ])
      break
    }

    // Subscription invoice paid → reset credits; credit pack → additive
    case 'invoice.paid': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice    = event.data.object as any
      const customerId = invoice.customer as string
      const priceId    = invoice.lines?.data?.[0]?.price?.id as string | undefined

      const stripeRecord = await db.stripeCustomer.findUnique({
        where: { stripeCustomerId: customerId },
      })
      if (!stripeRecord) break

      const userId = stripeRecord.userId

      // Never touch admin credits
      const user = await db.user.findUnique({ where: { id: userId }, select: { role: true } })
      if (user?.role === 'ADMIN') break

      const tier = priceId ? STRIPE_PRICE_TO_TIER[priceId] : undefined
      const creditPackCredits: Record<string, number> = {
        [STRIPE_CREDIT_PACK_PRICES.credits_100]:   100,
        [STRIPE_CREDIT_PACK_PRICES.credits_500]:   500,
        [STRIPE_CREDIT_PACK_PRICES.credits_2000]:  2000,
        [STRIPE_CREDIT_PACK_PRICES.credits_10000]: 10000,
      }

      const isSubscription = !!invoice.subscription

      if (isSubscription && tier && tier !== 'free' && tier !== 'admin') {
        const credits = SUBSCRIPTION_PLAN_CREDITS[tier]
        const updated = await db.user.update({
          where: { id: userId },
            data: {
              ...subscriptionCreditData(credits),
              subscriptionTier: tier,
              subscriptionStatus: 'active',
            },
          select: { creditBalance: true },
        })
        await db.creditTransaction.create({
          data: {
            userId,
            amount: credits,
            type: 'subscription',
            description: `Subscription refresh — ${tier} plan`,
            stripeId: event.id,
            balanceAfter: updated.creditBalance,
          },
        })
        console.log(`[Stripe] Subscription paid: ${credits} credits, tier=${tier} for ${userId}`)
      } else if (priceId && creditPackCredits[priceId]) {
        const packCredits = creditPackCredits[priceId]
        const updated = await db.user.update({
          where: { id: userId },
          data:  { creditBalance: { increment: packCredits } },
          select: { creditBalance: true },
        })
        await db.creditTransaction.create({
          data: {
            userId,
            amount:       packCredits,
            description:  `Credit pack purchase — ${packCredits} credits`,
            balanceAfter: updated.creditBalance,
          },
        })
        console.log(`[Stripe] Credit pack: ${packCredits} credits for ${userId}`)
      }
      break
    }

    case 'invoice.payment_failed': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const invoice = event.data.object as any
      const customerId = invoice.customer as string
      const stripeRecord = await db.stripeCustomer.findUnique({
        where: { stripeCustomerId: customerId },
      })
      if (stripeRecord) {
        await db.user.update({
          where: { id: stripeRecord.userId },
          data:  { subscriptionStatus: 'past_due' },
        })
      }
      break
    }

    case 'customer.subscription.created':
    case 'customer.subscription.updated': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = event.data.object as any
      const customerId = sub.customer as string
      const priceId = sub.items?.data?.[0]?.price?.id as string | undefined
      const tier = (priceId ? STRIPE_PRICE_TO_TIER[priceId] : sub.metadata?.tier) as SubscriptionTier | undefined
      const stripeRecord = await db.stripeCustomer.findUnique({
        where: { stripeCustomerId: customerId },
      })
      if (stripeRecord && tier) {
        await db.user.update({
          where: { id: stripeRecord.userId },
          data: {
            subscriptionTier:   tier,
            subscriptionStatus: sub.status as string,
          },
        })
      }
      if (stripeRecord && typeof sub.id === 'string') {
        const plan = sub.metadata?.plan === 'desktop' ? 'desktop' : (tier ?? 'free')
        await upsertSubscription({
          userId: stripeRecord.userId,
          providerSubId: sub.id,
          providerCustomerId: customerId,
          plan,
          status: typeof sub.status === 'string' ? sub.status : 'expired',
          currentPeriodEnd: typeof sub.current_period_end === 'number' ? new Date(sub.current_period_end * 1000) : null,
        })
      }
      break
    }

    case 'customer.subscription.deleted': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const sub = event.data.object as any
      const customerId = sub.customer as string
      const stripeRecord = await db.stripeCustomer.findUnique({
        where: { stripeCustomerId: customerId },
      })
      if (stripeRecord && typeof sub.id === 'string') {
        await upsertSubscription({
          userId: stripeRecord.userId,
          providerSubId: sub.id,
          plan: 'free',
          status: 'canceled',
          currentPeriodEnd: null,
        })
        await db.user.update({
          where: { id: stripeRecord.userId },
          data:  { subscriptionStatus: 'canceled' },
        })
      }
      break
    }

    // Legacy: checkout.session.completed
    case 'checkout.session.completed': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = event.data.object as any
      const userId  = session.metadata?.userId as string | undefined
      const credits = parseInt(session.metadata?.credits ?? '0')
      if (userId && credits > 0) {
        await db.$transaction(async (tx) => {
          await tx.processedStripeEvent.create({ data: { eventId: event.id, type: event.type } })
          const updated = await tx.user.update({
            where: { id: userId },
            data: { creditBalance: { increment: credits } },
            select: { creditBalance: true },
          })
          await tx.creditTransaction.create({
            data: {
              userId,
              amount: credits,
              type: 'purchase',
              description: 'Credit pack',
              stripeId: event.id,
              balanceAfter: updated.creditBalance,
            },
          })
        })
        return Response.json({ received: true })
      }
      break
    }
  }

  try {
    await db.processedStripeEvent.create({ data: { eventId: event.id, type: event.type } })
  } catch (err) {
    console.warn('[Stripe Webhook] duplicate', event.id, err instanceof Error ? err.message : err)
    return Response.json({ received: true })
  }

  return Response.json({ received: true })
}
