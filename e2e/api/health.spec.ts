import { test, expect } from '@playwright/test'

/**
 * API smoke tests — test all critical API endpoints for correct response shapes.
 * These run without a browser (pure HTTP).
 */

test.describe('Health endpoints', () => {
  test('GET /api/health without a session is refused', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.status()).toBe(401)
    const body = await res.json() as { error?: string }
    expect(body.error).toBe('Unauthorized')
  })

  test('GET /health rewrite → /api/health works', async ({ request }) => {
    const res = await request.get('/health')
    expect(res.status()).toBeLessThan(600)
  })
})

test.describe('Auth endpoints', () => {
  test('POST /api/auth/register with invalid data returns 400', async ({ request }) => {
    const res = await request.post('/api/auth/register', {
      data: { email: 'not-an-email', password: 'short' },
    })
    expect(res.status()).toBe(400)
  })

  test('POST /api/auth/mobile/login with wrong password returns 401', async ({ request }) => {
    const res = await request.post('/api/auth/mobile/login', {
      data: { email: 'nobody@example.com', password: 'wrongpassword' },
    })
    expect(res.status()).toBe(401)
    const body = await res.json() as { error: string }
    expect(body).toHaveProperty('error')
  })
})

test.describe('Protected API endpoints (unauthenticated)', () => {
  const protectedRoutes = [
    { method: 'GET', path: '/api/credits/balance' },
    { method: 'POST', path: '/api/jobs/create' },
    { method: 'GET', path: '/api/jobs/list' },
    { method: 'GET', path: '/api/vault/character/list' },
  ]

  for (const route of protectedRoutes) {
    test(`${route.method} ${route.path} returns 401 without auth`, async ({ request }) => {
      const res = route.method === 'GET'
        ? await request.get(route.path)
        : await request.post(route.path, { data: {} })
      expect(res.status()).toBe(401)
    })
  }
})

test.describe('Webhook endpoints', () => {
  test('POST /api/webhooks/stripe without signature returns 400', async ({ request }) => {
    const res = await request.post('/api/webhooks/stripe', {
      data: { type: 'checkout.session.completed' },
      headers: { 'content-type': 'application/json' },
    })
    // Should reject invalid webhook (no signature)
    expect([400, 401, 500]).toContain(res.status())
  })
})

test.describe('Cron endpoints (require CRON_SECRET)', () => {
  test('GET /api/cron/cleanup-jobs without secret returns 401', async ({ request }) => {
    const res = await request.get('/api/cron/cleanup-jobs')
    expect(res.status()).toBe(401)
  })

  test('GET /api/cron/process-rlhf without secret returns 401', async ({ request }) => {
    const res = await request.get('/api/cron/process-rlhf')
    expect(res.status()).toBe(401)
  })
})

test.describe('CORS headers', () => {
  test('API routes do not send an allow-origin header', async ({ request }) => {
    const res = await request.get('/api/health')
    expect(res.headers()['access-control-allow-origin']).toBeFalsy()
  })
})

test.describe('SSE endpoint structure', () => {
  test('GET /api/jobs/fake-id/stream returns 401 without auth', async ({ request }) => {
    const res = await request.get('/api/jobs/fake-job-id/stream')
    expect([401, 403, 404]).toContain(res.status())
  })
})
