import { NextRequest, NextResponse } from 'next/server'
import Stripe from 'stripe'

let _stripe: Stripe | null = null
function getStripe(): Stripe {
  if (!_stripe) {
    _stripe = new Stripe(process.env.STRIPE_SECRET_KEY!, {
      apiVersion: '2026-04-22.dahlia',
    })
  }
  return _stripe
}

const CREDIT_PACKS = [
  { credits: 100, price: 500, label: '100 Credits' },
  { credits: 500, price: 2000, label: '500 Credits' },
  { credits: 2000, price: 6500, label: '2,000 Credits' },
  { credits: 10000, price: 25000, label: '10,000 Credits' },
]

export async function GET() {
  return NextResponse.json({ packs: CREDIT_PACKS })
}

export async function POST(request: NextRequest) {
  const userId = request.headers.get('x-user-id')
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { packIndex } = await request.json()
  const pack = CREDIT_PACKS[packIndex]

  if (!pack) {
    return NextResponse.json({ error: 'Invalid pack' }, { status: 400 })
  }

  const session = await getStripe().checkout.sessions.create({
    payment_method_types: ['card'],
    line_items: [
      {
        price_data: {
          currency: 'usd',
          product_data: {
            name: `CINÉMA — ${pack.label}`,
            description: `${pack.credits} credits for CINÉMA AI video production`,
          },
          unit_amount: pack.price,
        },
        quantity: 1,
      },
    ],
    mode: 'payment',
    success_url: `${process.env.NEXT_PUBLIC_APP_URL}/simple?purchase=success`,
    cancel_url: `${process.env.NEXT_PUBLIC_APP_URL}/simple?purchase=cancelled`,
    metadata: {
      userId,
      credits: pack.credits.toString(),
    },
  })

  return NextResponse.json({ url: session.url })
}
