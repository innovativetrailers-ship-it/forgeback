import { OPERATION_COSTS, CreditError, checkAndDeductCredits } from '../lib/credits'

jest.mock('../lib/db', () => ({
  db: {
    $transaction: jest.fn(),
  },
}))

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { db } = require('../lib/db') as { db: { $transaction: jest.Mock } }

describe('OPERATION_COSTS', () => {
  it('has costs for all expected operations', () => {
    expect(OPERATION_COSTS.generate_kling_standard).toBeGreaterThan(0)
    expect(OPERATION_COSTS.generate_veo3).toBeGreaterThan(0)
    expect(OPERATION_COSTS.export_1080p).toBeGreaterThan(0)
    expect(OPERATION_COSTS.lora_training).toBeGreaterThan(0)
    expect(OPERATION_COSTS.proxy_draft).toBe(0)
  })

  it('keeps the live cost order (veo3 > kling_pro > luma > kling_standard)', () => {
    expect(OPERATION_COSTS.generate_veo3).toBeGreaterThan(OPERATION_COSTS.generate_kling_pro)
    expect(OPERATION_COSTS.generate_kling_pro).toBeGreaterThan(OPERATION_COSTS.generate_luma)
    expect(OPERATION_COSTS.generate_luma).toBeGreaterThan(OPERATION_COSTS.generate_kling_standard)
  })
})

describe('checkAndDeductCredits', () => {
  beforeEach(() => jest.clearAllMocks())

  it('throws CreditError when the balance inside the transaction cannot cover the operation', async () => {
    db.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => {
      return fn({
        user: {
          findUnique: jest.fn().mockResolvedValue({ creditBalance: 5, role: 'FREE' }),
          update: jest.fn(),
        },
        creditTransaction: { create: jest.fn() },
      })
    })

    await expect(
      checkAndDeductCredits('user-123', 'generate_kling_standard'),
    ).rejects.toThrow(CreditError)
  })

  it('deducts credits when the balance inside the transaction covers the operation', async () => {
    const mockUpdate = jest.fn().mockResolvedValue({ creditBalance: 992 })
    db.$transaction.mockImplementationOnce(async (fn: (tx: unknown) => Promise<void>) => {
      return fn({
        user: {
          findUnique: jest.fn().mockResolvedValue({ creditBalance: 1000, role: 'FREE' }),
          update: mockUpdate,
        },
        creditTransaction: { create: jest.fn() },
      })
    })

    await checkAndDeductCredits('user-123', 'generate_kling_standard')
    expect(mockUpdate).toHaveBeenCalled()
  })

  it('throws CreditError for an unknown operation', async () => {
    await expect(
      checkAndDeductCredits('user-123', 'unknown_operation_xyz'),
    ).rejects.toThrow(CreditError)
    expect(db.$transaction).not.toHaveBeenCalled()
  })
})
