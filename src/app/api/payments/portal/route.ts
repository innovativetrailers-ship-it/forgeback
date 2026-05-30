import { auth }    from '@/lib/auth'
import { db }      from '@/lib/db'
import Stripe      from 'stripe'

const getStripe = () => new Stripe(process.env.STRIPE_SECRET_KEY!, {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  apiVersion: '2026-04-22.dahlia' as any,
})

export async function POST(req: Request) {
  const session = await auth()
  if (!session?.user?.id) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // Look up Stripe customer ID
  const customer = await db.stripeCustomer.findUnique({
    where: { userId: session.user.id },
  })

  if (!customer?.stripeCustomerId) {
    return Response.json({ error: 'No billing account found' }, { status: 404 })
  }

  const portalSession = await getStripe().billingPortal.sessions.create({
    customer:   customer.stripeCustomerId,
    return_url: `${process.env.NEXT_PUBLIC_APP_URL}/simple`,
  })

  return Response.json({ url: portalSession.url })
}
