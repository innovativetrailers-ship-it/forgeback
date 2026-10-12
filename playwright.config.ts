import { defineConfig, devices } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  testMatch: ['**/*.spec.ts', '**/global.setup.ts'],
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 2 : 0,
  workers: process.env.CI ? 2 : undefined,
  reporter: process.env.CI
    ? [['github'], ['html', { open: 'never' }]]
    : [['list'], ['html', { open: 'on-failure' }]],

  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000',
    trace: 'on-first-retry',
    screenshot: 'only-on-failure',
    video: 'retain-on-failure',
    // Default timeout per action
    actionTimeout: 10_000,
  },

  projects: [
    // Global setup — creates a test user and stores auth state
    {
      name: 'setup',
      testMatch: '**/global.setup.ts',
    },

    // Desktop Chrome (primary)
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // Mobile Safari (for responsive checks)
    {
      name: 'mobile-safari',
      use: {
        ...devices['iPhone 15'],
        storageState: 'e2e/.auth/user.json',
      },
      dependencies: ['setup'],
    },

    // API tests — no browser needed
    {
      name: 'api',
      testMatch: '**/api/*.spec.ts',
      use: { baseURL: process.env.PLAYWRIGHT_BASE_URL ?? 'http://localhost:3000' },
    },
  ],

  // Start dev server automatically when running locally
  webServer: process.env.CI
    ? undefined
    : {
        command: 'npm run dev',
        url: 'http://localhost:3000',
        reuseExistingServer: true,
        timeout: 60_000,
      },
})
