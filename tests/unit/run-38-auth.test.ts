import { anonymousApiBlocked, stripSpoofedIdentity } from '../../src/lib/auth/identity'
import { isFalMediaUrl, signFalWebhookToken, verifyFalWebhookToken } from '../../src/lib/webhooks/falSignature'

describe('spoofed identity headers', () => {
  it('drops client identity headers and blocks anonymous API calls', () => {
    const headers = new Headers({
      'x-user-id': 'spoof',
      'x-user-role': 'ADMIN',
      'x-forge-desktop': '1',
      accept: 'application/json',
    })
    const clean = stripSpoofedIdentity(headers)
    expect(clean.get('x-user-id')).toBeNull()
    expect(clean.get('x-user-role')).toBeNull()
    expect(clean.get('x-forge-desktop')).toBeNull()
    expect(clean.get('accept')).toBe('application/json')
    expect(anonymousApiBlocked('/api/admin/promote', false, false)).toBe(true)
    expect(anonymousApiBlocked('/api/admin/promote', true, false)).toBe(false)
    expect(anonymousApiBlocked('/api/webhooks/fal', false, false)).toBe(false)
    expect(anonymousApiBlocked('/login', false, false)).toBe(false)
  })
})

describe('forged FAL webhook', () => {
  const prev = process.env.FAL_WEBHOOK_SECRET
  beforeAll(() => { process.env.FAL_WEBHOOK_SECRET = 'test-secret' })
  afterAll(() => { process.env.FAL_WEBHOOK_SECRET = prev })

  it('rejects a missing or stale token and a foreign media URL', () => {
    expect(verifyFalWebhookToken('')).toBeNull()
    expect(verifyFalWebhookToken('not-a-token')).toBeNull()
    const token = signFalWebhookToken('run_1', 60, 1_000)
    expect(verifyFalWebhookToken(token, 1_000)).toBe('run_1')
    expect(verifyFalWebhookToken(token, 2_000)).toBeNull()
    expect(isFalMediaUrl('https://v3.fal.media/files/out.mp4')).toBe(true)
    expect(isFalMediaUrl('https://evil.example/out.mp4')).toBe(false)
    expect(isFalMediaUrl('http://v3.fal.media/files/out.mp4')).toBe(false)
  })
})

describe('billing and camera ownership', () => {
  it('pack purchase survives reconcile', async () => {
    const { reportedLedgerBalance } = await import('../../src/lib/credits/ledgerDrift')
    expect(reportedLedgerBalance(600, 0)).toBe(600)
  })

  it('refuses a camera chunk from another account', async () => {
    const { cameraChunkAllowed } = await import('../../src/lib/camera/ownership')
    expect(cameraChunkAllowed('owner', 'owner')).toBe(true)
    expect(cameraChunkAllowed('owner', 'other')).toBe(false)
  })

  it('rejects a stripe delivery with no signature header', async () => {
    const { hasStripeSignature } = await import('../../src/lib/payments/stripeWebhook')
    expect(hasStripeSignature(null)).toBe(false)
    expect(hasStripeSignature('t=1,v1=abc')).toBe(true)
  })

  it('rate-limits a caller and refuses the diagnostics bypass in production', async () => {
    const { allowRate, resetRateBuckets, diagnosticsBypassAllowed } = await import('../../src/lib/http/rateLimit')
    resetRateBuckets()
    expect(allowRate('login-test', 2, 60_000, 1_000)).toBe(true)
    expect(allowRate('login-test', 2, 60_000, 1_001)).toBe(true)
    expect(allowRate('login-test', 2, 60_000, 1_002)).toBe(false)
    expect(diagnosticsBypassAllowed({ NODE_ENV: 'development', DIAGNOSTICS_DEV: 'true' } as NodeJS.ProcessEnv)).toBe(true)
    expect(() => diagnosticsBypassAllowed({ NODE_ENV: 'production', DIAGNOSTICS_DEV: 'true' } as NodeJS.ProcessEnv)).toThrow(/DIAGNOSTICS_DEV/)
  })
})

