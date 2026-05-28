import { stripe, PLATFORM_FEE_RATE, usdCentsToCredits } from '@/lib/payments/stripe'
import { getOrCreateStripeCustomer }                     from '@/lib/payments/stripeCustomer'
import { db }                                            from '@/lib/db'

export async function POST(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const { amountUSD } = await req.json() as { amountUSD: number }

  if (!amountUSD || amountUSD < 5) {
    return Response.json({ error: 'Minimum deposit is $5' }, { status: 400 })
  }

  const stripeCustomerId = await getOrCreateStripeCustomer(userId)
  const amountCents      = Math.round(amountUSD * 100)
  const platformFeeCents = Math.round(amountCents * PLATFORM_FEE_RATE)
  const vendorCents      = amountCents - platformFeeCents

  const paymentIntent = await stripe.paymentIntents.create({
    amount:               amountCents,
    currency:             'usd',
    customer:             stripeCustomerId,
    payment_method_types: ['card'],
    metadata: {
      userId,
      platformFeeCents: String(platformFeeCents),
      vendorCents:      String(vendorCents),
      purpose:          'credit_deposit',
    },
    description: `Cinematic Forge credit deposit — $${amountUSD}`,
  })

  await db.stripeDeposit.create({
    data: {
      userId,
      stripeCustomerId,
      paymentIntentId:       paymentIntent.id,
      amountCents,
      platformFeeCents,
      vendorAllocationCents: vendorCents,
      status:                'pending',
    },
  })

  return Response.json({
    clientSecret:   paymentIntent.client_secret,
    amountUSD,
    creditsToAdd:   usdCentsToCredits(vendorCents),
    platformFeeUSD: platformFeeCents / 100,
  })
}
