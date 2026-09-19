import { execSync } from 'node:child_process'
import { defineConfig, devices } from '@playwright/test'

const port = 4174
const baseURL = `http://localhost:${port}`

function commit(): string {
  try {
    const head = execSync('git rev-parse --short HEAD', { encoding: 'utf8' }).trim()
    const changes = execSync('git status --porcelain -- . ":!docs/perf"', { encoding: 'utf8' }).trim()
    return changes ? `${head}-dirty` : head
  } catch {
    return 'unknown'
  }
}

export default defineConfig({
  testDir: './scripts',
  testMatch: /(perf|memory)\.spec\.ts$/,
  outputDir: 'test-results/perf',
  fullyParallel: false,
  workers: 1,
  retries: 0,
  timeout: 360_000,
  expect: { timeout: 15_000 },
  reporter: [['list']],
  use: {
    baseURL,
    headless: process.env.PERF_HEADLESS === '1',
    acceptDownloads: true,
    trace: 'off',
    video: 'off',
    screenshot: 'off',
    timezoneId: 'America/Sao_Paulo',
    contextOptions: { reducedMotion: 'reduce' },
  },
  webServer: {
    command: `npx vite build --outDir dist-perf && npx vite preview --outDir dist-perf --port ${port} --strictPort`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 180_000,
    env: { VITE_COMMIT_SHA: commit() },
  },
  projects: [
    {
      name: 'chromium',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1920, height: 1080 },
        deviceScaleFactor: 1,
        launchOptions: { args: ['--enable-precise-memory-info'] },
      },
    },
  ],
})
