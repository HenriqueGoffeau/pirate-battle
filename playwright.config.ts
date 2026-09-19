import { defineConfig, devices } from '@playwright/test'

const liveURL = process.env.PB_BASE_URL
const baseURL = liveURL ?? 'http://localhost:4173'

export default defineConfig({
  testDir: './e2e/specs',
  snapshotPathTemplate: '{testDir}/../__screenshots__/{testFileName}/{arg}-{projectName}-{platform}{ext}',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: 0,
  workers: process.env.CI ? 2 : 4,
  timeout: 60_000,
  expect: {
    timeout: 10_000,
    toHaveScreenshot: { maxDiffPixelRatio: 0.005, animations: 'disabled', caret: 'hide' },
  },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    video: 'retain-on-failure',
    screenshot: 'only-on-failure',
    timezoneId: 'America/Sao_Paulo',
    contextOptions: { reducedMotion: 'reduce' },
  },
  webServer: liveURL
    ? undefined
    : {
        command: 'npm run build && npm run preview -- --strictPort',
        url: baseURL,
        reuseExistingServer: !process.env.CI,
        timeout: 180_000,
      },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 720 }, deviceScaleFactor: 1 },
    },
    {
      name: 'mobile',
      testMatch: /(test-01|test-09|visual)[^/\\]*\.spec\.ts$/,
      use: {
        ...devices['Pixel 7'],
        viewport: { width: 915, height: 412 },
        deviceScaleFactor: 1,
        isMobile: true,
        hasTouch: true,
      },
    },
  ],
})
