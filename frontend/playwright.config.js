import { defineConfig, devices } from '@playwright/test'

// End-to-end tests: a real browser against the real API and PostgreSQL. See e2e/README.md.
//
// Local (default): starts the API on port 8100 with its own database (helpdesk_e2e, reset with
// demo data on every run) and the app on port 3100.
//
// Deployed site: set E2E_BASE_URL (e.g. https://xxxx.cloudfront.net) and E2E_PASSWORD (the demo
// accounts' password there). Nothing is started locally, timeouts allow for a cold Lambda and a
// paused database, and tests tagged @local-only (ones that can only succeed once) are skipped.
const API_URL = 'http://localhost:8100'
const APP_URL = 'http://localhost:3100'
const CLOUD_URL = process.env.E2E_BASE_URL?.replace(/\/$/, '')
const isCloud = Boolean(CLOUD_URL)

export default defineConfig({
  testDir: './e2e',
  // The journeys share one database, so run them one at a time in a fixed order.
  workers: 1,
  fullyParallel: false,
  timeout: isCloud ? 120_000 : 60_000,
  expect: { timeout: isCloud ? 30_000 : 10_000 },
  retries: isCloud ? 1 : 0,
  grepInvert: isCloud ? /@local-only/ : undefined,
  globalSetup: isCloud ? './e2e/cloud-setup.js' : undefined,
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: CLOUD_URL ?? APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /phone\.spec/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /phone\.spec/ },
  ],
  webServer: isCloud ? undefined : [
    {
      command: './e2e/start-api.sh',
      url: `${API_URL}/api/helpdesk/health`,
      reuseExistingServer: false,
      timeout: 120_000,
    },
    {
      command: 'npx vite --port 3100 --strictPort',
      url: APP_URL,
      env: { HELPDESK_API_TARGET: API_URL },
      reuseExistingServer: false,
      timeout: 60_000,
    },
  ],
})
