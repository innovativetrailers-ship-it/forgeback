const constructEvent = jest.fn()

jest.mock('@/lib/payments/stripe', () => ({
  stripe: { webhooks: { constructEvent }, customers: { update: jest.fn() } },
  usdCentsToCredits: (cents: number) => cents,
}))

jest.mock('@/lib/db', () => ({ db: { processedStripeEvent: { findUnique: jest.fn() } } }))
jest.mock('@/lib/credits', () => ({ grantCredits: jest.fn() }))
jest.mock('@/lib/entitlement/resolve', () => ({ upsertSubscription: jest.fn() }))

import { POST } from '../app/api/webhooks/stripe/route'

describe('stripe webhook signatures', () => {
  beforeEach(() => jest.clearAllMocks())

  it('rejects a missing signature before the event is trusted', async () => {
    const res = await POST(new Request('http://local/api/webhooks/stripe', { method: 'POST', body: '{}' }))
    expect(res.status).toBe(400)
    expect(constructEvent).not.toHaveBeenCalled()
  })

  it('rejects a forged signature', async () => {
    constructEvent.mockImplementation(() => { throw new Error('bad signature') })
    const res = await POST(new Request('http://local/api/webhooks/stripe', {
      method: 'POST',
      body: '{}',
      headers: { 'stripe-signature': 't=1,v1=forged' },
    }))
    expect(res.status).toBe(400)
    const body = await res.json() as { error?: string }
    expect(body.error).toMatch(/Invalid signature/)
  })
})
