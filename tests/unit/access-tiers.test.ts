import {
  getEffectiveTier,
  hasActiveBilling,
  resolveSubscriptionTier,
  TIER_DISPLAY_NAMES,
  TIER_PERMISSIONS,
} from '../../src/lib/access/tiers'

describe('access tiers', () => {
  it('maps display names Simple / Advanced / Ultimate', () => {
    expect(TIER_DISPLAY_NAMES.pro).toBe('Simple')
    expect(TIER_DISPLAY_NAMES.studio).toBe('Advanced')
    expect(TIER_DISPLAY_NAMES.ultimate).toBe('Ultimate')
  })

  it('pro does not require subscription; studio/ultimate do', () => {
    expect(TIER_PERMISSIONS.pro.requiresSubscription).toBe(false)
    expect(TIER_PERMISSIONS.studio.requiresSubscription).toBe(true)
    expect(TIER_PERMISSIONS.ultimate.requiresSubscription).toBe(true)
    expect(TIER_PERMISSIONS.ultimate.download).toBe(true)
  })

  it('locks studio/ultimate when billing inactive', () => {
    expect(getEffectiveTier('studio', 'canceled', false)).toBe('free')
    expect(getEffectiveTier('ultimate', 'trial', false)).toBe('free')
    expect(getEffectiveTier('studio', 'active', false)).toBe('studio')
    expect(getEffectiveTier('studio', 'past_due', false)).toBe('studio')
  })

  it('pro works without active billing', () => {
    expect(getEffectiveTier('pro', 'trial', false)).toBe('pro')
  })

  it('resolves legacy subscriptionStatus tier values', () => {
    expect(resolveSubscriptionTier(null, 'studio', 'USER')).toBe('studio')
    expect(resolveSubscriptionTier('ultimate', 'active', 'USER')).toBe('ultimate')
    expect(resolveSubscriptionTier(null, 'active', 'USER')).toBe('pro')
  })

  it('hasActiveBilling includes past_due grace', () => {
    expect(hasActiveBilling('active')).toBe(true)
    expect(hasActiveBilling('past_due')).toBe(true)
    expect(hasActiveBilling('canceled')).toBe(false)
  })
})
