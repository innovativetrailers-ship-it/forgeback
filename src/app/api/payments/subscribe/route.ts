import { auth }    from '@/lib/auth'
import Stripe      from 'stripe'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: '2026-04-22.dahlia' as any,
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { priceId?: string }
  if (!body.priceId) return Response.json({ error: 'priceId required' }, { status: 400 })

  const checkout = await getStripe().checkout.sessions.create({
    mode:                 'subscription',
    payment_method_types: ['card'],
    line_items:           [{ price: body.priceId, quantity: 1 }],
    success_url:          `${process.env.NEXT_PUBLIC_APP_URL}/simple?payment=success`,
    cancel_url:           `${process.env.NEXT_PUBLIC_APP_URL}/signup?payment=cancelled`,
    client_reference_id:  session.user.id,
    metadata:             { userId: session.user.id },
    allow_promotion_codes: true,
  })

  return Response.json({ url: checkout.url })
}
