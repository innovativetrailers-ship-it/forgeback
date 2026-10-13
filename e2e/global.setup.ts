import { test as setup, expect } from '@playwright/test'
import path from 'path'

const AUTH_FILE = path.join(__dirname, '.auth/user.json')

/**
 * Global setup — registers a test user (or logs in if already exists),
 * then saves the authenticated browser state so all tests can reuse it
 * without re-logging-in.
 */
setup('create authenticated user session', async ({ page, request }) => {
  const email = `playwright-${Date.now()}@test.cinema`
  const password = 'PlaywrightTest123!'

  // Register via API (faster than UI flow)
  const regRes = await request.post('/api/auth/register', {
    data: { name: 'Playwright User', email, password, dateOfBirth: '1990-01-01' },
  })

  // 200 = new user created, 409 = already exists (re-run) — both are fine
  expect([200, 201, 409]).toContain(regRes.status())

  // Now log in via the UI to get a real browser session
  await page.goto('/login')
  await page.waitForLoadState('networkidle')

  await page.fill('input[type="email"]', email)
  await page.fill('input[type="password"]', password)
  await page.click('button[type="submit"]')

  // Wait for redirect to the editor
  await page.waitForURL(/\/(simple|advanced|ultimate|\(editor\))/, { timeout: 15_000 })

  // Save auth state
  await page.context().storageState({ path: AUTH_FILE })
  console.log(`✓ Test session created for: ${email}`)
})
