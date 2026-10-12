import { tierFieldsFromSubscription } from '../lib/access/guard'

describe('subscription is the tier source', () => {
  it('reads the subscription plan and ignores a user-column tier', () => {
    const fields = tierFieldsFromSubscription({ plan: 'studio', status: 'active' }, 'USER')
    expect(fields.tier).toBe('studio')
    expect(tierFieldsFromSubscription(null, 'USER').tier).toBe('free')
  })
})
