import { stripe, usdCentsToCredits } from './stripe'
import { db } from '@/lib/db'

export async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const existing = await db.stripeCustomer.findUnique({ where: { userId } })
  if (existing) return existing.stripeCustomerId

  const user = await db.user.findUnique({
    where:  { id: userId },
    select: { email: true, name: true },
  })
  if (!user) throw new Error('User not found')

  const customer = await stripe.customers.create({
    email:    user.email,
    name:     user.name ?? undefined,
    metadata: { userId, platform: 'cinematic-forge' },
  })

  await db.stripeCustomer.create({
    data: {
      userId,
      stripeCustomerId:   customer.id,
      stripeBalanceCents: 0,
    },
  })

  return customer.id
}

export async function getStripeBalance(userId: string): Promise<{
  balanceCents: number
  credits:      number
}> {
  const record = await db.stripeCustomer.findUnique({ where: { userId } })
  if (!record) return { balanceCents: 0, credits: 0 }

  const customer = await stripe.customers.retrieve(record.stripeCustomerId)
  if (customer.deleted) return { balanceCents: 0, credits: 0 }

  const balanceCents = Math.abs(customer.balance < 0 ? customer.balance : 0)

  await db.stripeCustomer.update({
    where: { userId },
    data:  { stripeBalanceCents: balanceCents },
  })

  return {
    balanceCents,
    credits: usdCentsToCredits(balanceCents),
  }
}
