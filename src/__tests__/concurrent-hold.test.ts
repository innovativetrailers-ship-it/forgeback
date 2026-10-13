const updateMany = jest.fn()

jest.mock('@/lib/db', () => ({
  db: {
    user: {
      findUnique: jest.fn().mockResolvedValue({
        creditBalance: 100,
        role: 'FREE',
        heldCredits: 0,
        isInternal: false,
        email: 'susi.tate@gmail.com',
        allocationCredits: 100,
        purchasedCredits: 0,
      }),
    },
    creditHold: { upsert: jest.fn() },
    creditTransaction: { create: jest.fn() },
    $transaction: jest.fn(async (fn: (tx: unknown) => Promise<unknown>) => fn({
      user: { updateMany },
      creditHold: { upsert: jest.fn().mockResolvedValue({}) },
      creditTransaction: { create: jest.fn().mockResolvedValue({}) },
    })),
  },
}))

import { openHold, EscrowError } from '../lib/credits/escrow'

describe('concurrent holds', () => {
  it('refuses the second hold when the balance check inside the transaction loses', async () => {
    updateMany.mockResolvedValueOnce({ count: 1 }).mockResolvedValueOnce({ count: 0 })
    await expect(openHold('user-1', 'job-a', 10)).resolves.toBeGreaterThan(0)
    await expect(openHold('user-1', 'job-b', 10)).rejects.toBeInstanceOf(EscrowError)
    expect(updateMany).toHaveBeenCalledTimes(2)
    expect(updateMany.mock.calls[0][0].where.creditBalance).toEqual({ gte: 12 })
  })
})
