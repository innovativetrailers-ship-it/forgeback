import { desktopAccessFromRows, entitlementCaller } from '../../src/lib/entitlement/desktopAccess'
import { linkExpired, linkPollDecision, rateLimitExceeded, LINK_TTL_MS } from '../../src/lib/desktop/linkCode'
import { macReleaseReady } from '../../src/lib/desktop/releases'

describe('desktop link codes', () => {
  const now = Date.parse('2026-10-12T00:00:00Z')

  it('expires after 10 minutes and is single use', () => {
    const expiresAt = new Date(now + LINK_TTL_MS)
    expect(linkExpired(expiresAt, now + LINK_TTL_MS)).toBe(true)
    expect(linkExpired(new Date(now + LINK_TTL_MS - 1), now)).toBe(false)
    expect(linkPollDecision({
      deviceId: 'dev-1',
      storedDeviceId: 'dev-1',
      expiresAt,
      consumedAt: null,
      approvedAt: new Date(now),
      now,
    })).toBe('ready')
    expect(linkPollDecision({
      deviceId: 'dev-1',
      storedDeviceId: 'dev-1',
      expiresAt,
      consumedAt: new Date(now),
      approvedAt: new Date(now),
      now,
    })).toBe('used')
    expect(linkPollDecision({
      deviceId: 'other',
      storedDeviceId: 'dev-1',
      expiresAt,
      consumedAt: null,
      approvedAt: new Date(now),
      now,
    })).toBe('device')
    expect(rateLimitExceeded(5, 5)).toBe(true)
    expect(rateLimitExceeded(4, 5)).toBe(false)
  })
})

describe('internal desktop entitlement', () => {
  it('grants desktop access from the database row with no plan and no expiry', () => {
    const access = desktopAccessFromRows(
      { role: 'FREE', isInternal: true, hasUsedDesktopTrial: false },
      [],
    )
    expect(access.canUseDesktop).toBe(true)
    expect(access.internal).toBe(true)
    expect(access.currentPeriodEnd).toBeNull()
    expect(access.trialDaysLeft).toBeNull()
    expect(desktopAccessFromRows(
      { role: 'ADMIN', isInternal: false, hasUsedDesktopTrial: false },
      [],
    ).canUseDesktop).toBe(true)
  })

  it('does not grant internal access from a spoofed header', () => {
    expect(entitlementCaller({
      headerUserId: 'admin-looking-id',
      sessionUserId: null,
      tokenUserId: null,
    })).toBeNull()
    expect(entitlementCaller({
      headerUserId: 'someone-else',
      sessionUserId: 'real-user',
      tokenUserId: null,
    })).toBe('real-user')
  })

  it('still requires a plan for everyone else', () => {
    expect(desktopAccessFromRows(
      { role: 'FREE', isInternal: false, hasUsedDesktopTrial: false },
      [],
    ).canUseDesktop).toBe(false)
  })
})

describe('mac release gate', () => {
  const hash = 'a'.repeat(64)

  it('requires notarised 3.0.4 or newer and a matching sha256', () => {
    expect(macReleaseReady({ version: '3.0.5', notarized: true, sha256: hash, sidecar: hash })).toBe(true)
    expect(macReleaseReady({ version: '3.0.3', notarized: true, sha256: hash, sidecar: hash })).toBe(false)
    expect(macReleaseReady({ version: '3.0.5', notarized: true, sha256: hash, sidecar: 'b'.repeat(64) })).toBe(false)
    expect(macReleaseReady({ version: '3.0.5', notarized: false, sha256: hash, sidecar: hash })).toBe(false)
  })
})
