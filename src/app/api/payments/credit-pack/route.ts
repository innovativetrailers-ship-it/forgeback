import { auth }    from '@/lib/auth'
import Stripe      from 'stripe'

// Credit pack price IDs — set in Stripe Dashboard and Vercel env
const CREDIT_PACKS: Record<string, { priceId: string; credits: number; label: string }> = {
  starter:      { priceId: process.env.STRIPE_PRICE_CREDITS_STARTER  ?? '', credits: 200,   label: '200 credits' },
  standard:     { priceId: process.env.STRIPE_PRICE_CREDITS_STANDARD ?? '', credits: 600,   label: '600 credits' },
  pro:          { priceId: process.env.STRIPE_PRICE_CREDITS_PRO      ?? '', credits: 1500,  label: '1,500 credits' },
  professional: { priceId: process.env.STRIPE_PRICE_CREDITS_PROF     ?? '', credits: 4000,  label: '4,000 credits' },
}

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: '2026-04-22.dahlia' as any,
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await req.json() as { packId?: string }
  if (!body.packId) return Response.json({ error: 'packId required' }, { status: 400 })

  const pack = CREDIT_PACKS[body.packId]
  if (!pack) return Response.json({ error: 'Unknown credit pack' }, { status: 400 })
  if (!pack.priceId) return Response.json({ error: 'Pack not configured' }, { status: 503 })

  const checkout = await getStripe().checkout.sessions.create({
    mode:                 'payment',
    payment_method_types: ['card'],
    line_items:           [{ price: pack.priceId, quantity: 1 }],
    success_url:          `${process.env.NEXT_PUBLIC_APP_URL}/simple?credits=success&pack=${body.packId}`,
    cancel_url:           `${process.env.NEXT_PUBLIC_APP_URL}/simple?credits=cancelled`,
    client_reference_id:  session.user.id,
    metadata:             { userId: session.user.id, packId: body.packId, credits: String(pack.credits) },
  })

  return Response.json({ url: checkout.url })
}
