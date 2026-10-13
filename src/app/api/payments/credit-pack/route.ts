import { creditPackById } from '@cinema/core'
import { auth }    from '@/lib/auth'
import Stripe      from 'stripe'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: '2026-04-22.dahlia' as any,
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { packId?: string }
  if (!body.packId) return Response.json({ error: 'packId required' }, { status: 400 })

  const pack = creditPackById(body.packId)
  const priceId = pack ? process.env[pack.stripePriceEnv] ?? '' : ''
  if (!pack) return Response.json({ error: 'Unknown credit pack' }, { status: 400 })
  if (!priceId) return Response.json({ error: 'Pack not configured' }, { status: 503 })

  const checkout = await getStripe().checkout.sessions.create({
    mode:                 'payment',
    payment_method_types: ['card'],
    line_items:           [{ price: priceId, quantity: 1 }],
    success_url:          `${process.env.NEXT_PUBLIC_APP_URL}/simple?credits=success&pack=${body.packId}`,
    cancel_url:           `${process.env.NEXT_PUBLIC_APP_URL}/simple?credits=cancelled`,
    client_reference_id:  session.user.id,
    metadata:             { userId: session.user.id, packId: body.packId, credits: String(pack.credits) },
  })

  return Response.json({ url: checkout.url })
}
