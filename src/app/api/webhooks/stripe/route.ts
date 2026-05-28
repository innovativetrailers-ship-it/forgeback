import { stripe, usdCentsToCredits } from '@/lib/payments/stripe'
import { db }                        from '@/lib/db'

export const config = { api: { bodyParser: false } }

export async function POST(req: Request) {
  const body      = await req.text()
  const signature = req.headers.get('stripe-signature')!

  let event: ReturnType<typeof stripe.webhooks.constructEvent>
  try {
    event = stripe.webhooks.constructEvent(body, signature, process.env.STRIPE_WEBHOOK_SECRET!)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Unknown error'
    console.error('[Stripe Webhook] Invalid signature:', msg)
    return Response.json({ error: 'Invalid signature' }, { status: 400 })
  }

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

    // Legacy: checkout.session.completed
    case 'checkout.session.completed': {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const session = event.data.object as any
      const userId  = session.metadata?.userId as string | undefined
      const credits = parseInt(session.metadata?.credits ?? '0')
      if (userId && credits > 0) {
        await db.user.update({ where: { id: userId }, data: { creditBalance: { increment: credits } } })
      }
      break
    }
  }

  return Response.json({ received: true })
}
