import { getStripeBalance } from '@/lib/payments/stripeCustomer'
import { db }               from '@/lib/db'

export async function GET(req: Request) {
  const userId = req.headers.get('x-user-id')
  if (!userId) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { creditBalance: true, role: true },
  })

  if (user?.role === 'ADMIN') {
    return Response.json({ credits: 9999999, balanceUSD: 9999999, isAdmin: true })
  }

  const { balanceCents, credits: stripeCredits } = await getStripeBalance(userId)

  return Response.json({
    credits:    user?.creditBalance ?? 0,
    balanceUSD: balanceCents / 100,
    stripeSync: stripeCredits,
  })
}
