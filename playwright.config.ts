import { defineConfig, devices } from '@playwright/test'

const CHROME_PATH = process.env.PLAYWRIGHT_CHROME_PATH

export default defineConfig({
  testDir: './tests/e2e',
  fullyParallel: false,
  retries: process.env.CI ? 2 : 0,
  reporter: [['list'], ['json', { outputFile: 'e2e-artifacts/playwright-report.json' }]],
  use: {
    baseURL: 'http://localhost:3000',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    ...(CHROME_PATH ? { launchOptions: { executablePath: CHROME_PATH } } : {}),
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
  webServer: {
    command: 'npm run dev',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    timeout: 120000,
  },
})
