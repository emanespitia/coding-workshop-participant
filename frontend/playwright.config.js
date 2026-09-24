import { defineConfig, devices } from '@playwright/test'

// End-to-end tests: a real browser against the real API and PostgreSQL.
// The API (port 8100) runs on its own database, helpdesk_e2e, reset with demo data on every run;
// the app (port 3100) is the Vite dev server proxying /api/helpdesk to it. See e2e/README.md.
const API_URL = 'http://localhost:8100'
const APP_URL = 'http://localhost:3100'

export default defineConfig({
  testDir: './e2e',
  // The journeys share one database, so run them one at a time in a fixed order.
  workers: 1,
  fullyParallel: false,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'e2e-report' }]],
  use: {
    baseURL: APP_URL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] }, testIgnore: /phone\.spec/ },
    { name: 'phone', use: { ...devices['Pixel 7'] }, testMatch: /phone\.spec/ },
  ],
  webServer: [
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
