import { auth } from '@/lib/auth'
import Stripe from 'stripe'
import { NextResponse } from 'next/server'

let _stripe: Stripe | null = null
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-04-22.dahlia',
    })
  }
  return _stripe
}

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { priceId, mode = 'payment' } = await req.json() as { priceId: string; mode?: string }

  const checkoutSession = await getStripe().checkout.sessions.create({
    mode: mode as 'payment' | 'subscription',
    payment_method_types: ['card'],
    line_items: [{ price: priceId, quantity: 1 }],
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/simple?payment=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/signup?payment=cancelled`,
    client_reference_id: session.user.id,
    metadata: { userId: session.user.id },
  })

  return NextResponse.json({ url: checkoutSession.url })
}
