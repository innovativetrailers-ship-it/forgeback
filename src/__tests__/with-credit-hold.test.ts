import { consumeFromHold, openHold, releaseHold, settleHold } from '../lib/credits/escrow'
import { withCreditHold } from '../lib/billing/withCreditHold'

jest.mock('../lib/credits/escrow', () => ({
  openHold: jest.fn(),
  consumeFromHold: jest.fn(),
  settleHold: jest.fn(),
  releaseHold: jest.fn(),
  EscrowError: class EscrowError extends Error {},
}))

const open = openHold as jest.Mock
const consume = consumeFromHold as jest.Mock
const settle = settleHold as jest.Mock
const release = releaseHold as jest.Mock

describe('withCreditHold', () => {
  beforeEach(() => jest.clearAllMocks())

  it('opens a hold, charges the estimate, and settles when the call returns', async () => {
    const value = await withCreditHold('user-1', 4, async () => 'clip')
    expect(value).toBe('clip')
    expect(open).toHaveBeenCalledWith('user-1', expect.any(String), 4)
    expect(consume).toHaveBeenCalledWith(expect.any(String), 'delivery', 4)
    expect(settle).toHaveBeenCalled()
    expect(release).not.toHaveBeenCalled()
  })

  it('does not call the provider when the hold is refused', async () => {
    open.mockRejectedValueOnce(new Error('Insufficient credits: need 12 held, have 0'))
    const run = jest.fn()
    await expect(withCreditHold('user-1', 9, run)).rejects.toThrow(/Insufficient credits/)
    expect(run).not.toHaveBeenCalled()
  })

  it('releases the hold when the paid call throws', async () => {
    await expect(withCreditHold('user-1', 2, async () => { throw new Error('provider down') })).rejects.toThrow('provider down')
    expect(open).toHaveBeenCalled()
    expect(release).toHaveBeenCalled()
    expect(settle).not.toHaveBeenCalled()
  })
})
