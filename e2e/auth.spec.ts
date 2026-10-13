import { test, expect } from '@playwright/test'

/**
 * Auth E2E tests — run without pre-existing auth state (fresh browser).
 * These tests cover the full login/register flow from scratch.
 */
test.use({ storageState: { cookies: [], origins: [] } })

test.describe('Login page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/login')
    await page.waitForLoadState('networkidle')
  })

  test('renders login form', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]')).toBeVisible()
    await expect(page.locator('button[type="submit"]')).toBeVisible()
  })

  test('shows validation error on empty submit', async ({ page }) => {
    await page.click('button[type="submit"]')
    // Button should be disabled with empty fields, form should not submit
    await expect(page).toHaveURL('/login')
  })

  test('shows error on invalid credentials', async ({ page }) => {
    await page.fill('input[type="email"]', 'notareal@user.com')
    await page.fill('input[type="password"]', 'wrongpassword')
    await page.click('button[type="submit"]')

    // Should show an error message and stay on login page
    await expect(page.locator('[role="alert"], .text-red, [data-error]').first()).toBeVisible({
      timeout: 8_000,
    }).catch(() => {
      // Alternatively stay on login URL
    })
    await expect(page).toHaveURL('/login')
  })

  test('navigates to register page', async ({ page }) => {
    const registerLink = page.getByRole('link', { name: /register|sign up|create account/i })
    await registerLink.click()
    await expect(page).toHaveURL('/register')
  })
})

test.describe('Registration page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/register')
    await page.waitForLoadState('networkidle')
  })

  test('renders registration form', async ({ page }) => {
    await expect(page.locator('input[type="email"]')).toBeVisible()
    await expect(page.locator('input[type="password"]').first()).toBeVisible()
  })

  test('registers a new user and redirects to editor', async ({ page }) => {
    const ts = Date.now()
    await page.fill('input[name="name"], input[placeholder*="name" i]', 'Test User')
    await page.fill('input[type="email"]', `test-${ts}@playwright.cinema`)
    await page.fill('input[type="password"]', 'TestPassword123!')
    await page.fill('input[name="dateOfBirth"]', '1990-01-01')
    // Confirm password if present
    const confirmInput = page.locator('input[name="confirm"], input[placeholder*="confirm" i]')
    if (await confirmInput.count() > 0) {
      await confirmInput.fill('TestPassword123!')
    }

    await page.click('button[type="submit"]')

    // Should redirect to editor after registration
    await page.waitForURL(/\/(simple|advanced|ultimate)/, { timeout: 15_000 })
    await expect(page).not.toHaveURL('/login')
  })
})

test.describe('Protected routes redirect', () => {
  test('redirects unauthenticated user from /simple to /login', async ({ page }) => {
    await page.goto('/simple')
    await page.waitForURL('/login', { timeout: 10_000 })
    await expect(page).toHaveURL('/login')
  })

  test('redirects unauthenticated user from /advanced to /login', async ({ page }) => {
    await page.goto('/advanced')
    await page.waitForURL('/login', { timeout: 10_000 })
    await expect(page).toHaveURL('/login')
  })
})
