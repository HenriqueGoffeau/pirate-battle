import { spawnSync } from 'node:child_process'

const playwright = spawnSync(
  process.execPath,
  ['node_modules/@playwright/test/cli.js', 'test', '-c', 'playwright.perf.config.ts', ...process.argv.slice(2)],
  { stdio: 'inherit' },
)
const report = spawnSync(process.execPath, ['scripts/perf-report.ts'], { stdio: 'inherit' })
const playwrightStatus = playwright.status ?? 1

process.exit(playwrightStatus === 0 ? (report.status ?? 1) : playwrightStatus)
