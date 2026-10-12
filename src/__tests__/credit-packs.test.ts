import { CREDIT_PACKS, creditPackById, creditsForStripePrice } from '../../packages/core/src/logic/creditPacks'
import { grantCredits } from '../lib/credits'

describe('credit pack catalog', () => {
  it('is one AUD catalog and resolves legacy pack ids', () => {
    expect(CREDIT_PACKS.map((pack) => pack.credits)).toEqual([100, 500, 2000, 10000])
    expect(CREDIT_PACKS.every((pack) => pack.priceAudCents > 0)).toBe(true)
    expect(creditPackById('starter')?.id).toBe('credits_100')
    expect(creditPackById('missing')).toBeNull()
  })

  it('grants the catalog amount for a configured Stripe price', () => {
    const credits = creditsForStripePrice('price_500', { STRIPE_PRICE_CREDITS_500: 'price_500' })
    expect(credits).toBe(500)
    expect(creditsForStripePrice('price_other', {})).toBeNull()
  })
})

describe('grantCredits', () => {
  it('adds credits once for a provider and external id', async () => {
    const rows: Array<{ stripeId: string; balanceAfter: number }> = []
    let balance = 10
    const db = {
      $transaction: async (fn: (tx: unknown) => Promise<unknown>) => fn({
        creditTransaction: {
          findFirst: async ({ where }: { where: { stripeId: string } }) =>
            rows.find((row) => row.stripeId === where.stripeId) ?? null,
          create: async ({ data }: { data: { stripeId: string; balanceAfter: number } }) => {
            rows.push(data)
          },
        },
        user: {
          update: async () => {
            balance += 100
            return { creditBalance: balance }
          },
        },
      }),
    }
    const first = await grantCredits(db, 'user-1', 'stripe', 'evt_1', 100, 'credit_pack')
    const second = await grantCredits(db, 'user-1', 'stripe', 'evt_1', 100, 'credit_pack')
    expect(first).toEqual({ granted: true, balanceAfter: 110 })
    expect(second.granted).toBe(false)
    expect(rows).toHaveLength(1)
  })
})