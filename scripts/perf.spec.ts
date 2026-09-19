import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { expect, test, type Page } from '@playwright/test'
import { GameConfig } from '../src/config/gameConfig'

type PerfRun = {
  meta: Record<string, unknown>
  config: { sessionSeconds: number; spawnIntervalSec: number; custom: boolean }
  summary: { meanFps: number; p95Ms: number; endReason: string | null }
}

const reportPath = 'docs/perf/perf-run.json'
const options = { sessionSeconds: 180, spawnIntervalSec: 1 }
const survivorHealth = 100_000
const balance = { ...GameConfig, player: { ...GameConfig.player, maxHealth: survivorHealth } }
const maxDriveMs = 240_000
const tickMs = 50
const resumeCheckMs = 2_000
const botPattern =
  'W held except 0.6 s of every 12 s; a 1.3 s turn every 5 s (right, right, left); Space held 3 s of every 4 s; Q and E held 0.4 s every 3 s, 1.5 s apart'

function wantedKeys(seconds: number): Set<string> {
  const keys = new Set<string>()
  if (seconds % 12 < 11.4) keys.add('KeyW')
  if (seconds % 5 < 1.3) keys.add(Math.floor(seconds / 5) % 3 === 2 ? 'KeyA' : 'KeyD')
  if (seconds % 4 < 3) keys.add('Space')
  if (seconds % 3 < 0.4) keys.add('KeyQ')
  if ((seconds + 1.5) % 3 < 0.4) keys.add('KeyE')
  return keys
}

async function releaseAll(page: Page, held: Set<string>): Promise<void> {
  for (const key of held) await page.keyboard.up(key)
  held.clear()
}

async function resumeIfPaused(page: Page, held: Set<string>): Promise<boolean> {
  const resume = page.getByRole('button', { name: 'Resume' })
  if (!(await resume.isVisible())) return false
  await releaseAll(page, held)
  await resume.click()
  return true
}

async function drive(page: Page, finished: () => boolean): Promise<number> {
  const held = new Set<string>()
  const started = Date.now()
  let resumes = 0
  let checkedAt = started
  while (!finished() && Date.now() - started < maxDriveMs) {
    const wanted = wantedKeys((Date.now() - started) / 1000)
    for (const key of [...held]) {
      if (wanted.has(key)) continue
      await page.keyboard.up(key)
      held.delete(key)
    }
    for (const key of wanted) {
      if (held.has(key)) continue
      await page.keyboard.down(key)
      held.add(key)
    }
    if (Date.now() - checkedAt >= resumeCheckMs) {
      checkedAt = Date.now()
      if (await resumeIfPaused(page, held)) resumes += 1
    }
    await page.waitForTimeout(tickMs)
  }
  await releaseAll(page, held)
  return resumes
}

test('180 s match with 1 s spawns keeps 60 FPS (PERF-01, PERF-02, PERF-04)', async ({ page, browser, browserName }) => {
  const consoleErrors: string[] = []
  page.on('console', (message) => {
    if (message.type() === 'error') consoleErrors.push(message.text())
  })
  page.on('pageerror', (error) => consoleErrors.push(error.message))
  await page.addInitScript(
    ({ options, balance }) => {
      localStorage.setItem('pb:v1:options', JSON.stringify(options))
      localStorage.setItem('pb:v1:dev', 'true')
      localStorage.setItem('pb:v1:devBalance', JSON.stringify(balance))
    },
    { options, balance },
  )
  await page.goto('/?perf=1')
  await page.waitForSelector('body[data-msw-ready]', { state: 'attached' })

  let downloaded = false
  const download = page.waitForEvent('download', { timeout: maxDriveMs + 60_000 }).then((value) => {
    downloaded = true
    return value
  })
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled({ timeout: 30_000 })
  const resumes = await drive(page, () => downloaded)

  const file = await (await download).path()
  const run = JSON.parse(readFileSync(file, 'utf8')) as PerfRun
  run.meta = {
    ...run.meta,
    browser: { name: browserName, version: browser.version(), headless: process.env.PERF_HEADLESS === '1' },
    balanceOverride: { 'player.maxHealth': { value: survivorHealth, default: GameConfig.player.maxHealth } },
    bot: { pattern: botPattern, autoResumes: resumes },
    consoleErrors,
  }
  mkdirSync('docs/perf', { recursive: true })
  writeFileSync(reportPath, `${JSON.stringify(run, null, 2)}\n`)

  expect.soft(run.config.sessionSeconds).toBe(options.sessionSeconds)
  expect.soft(run.config.spawnIntervalSec).toBe(options.spawnIntervalSec)
  expect.soft(run.summary.endReason).toBe('timeUp')
  expect.soft(resumes, 'the match was paused during the run').toBe(0)
  expect.soft(consoleErrors).toEqual([])
  expect.soft(run.summary.meanFps, 'mean FPS').toBeGreaterThanOrEqual(58)
  expect.soft(run.summary.p95Ms, 'p95 frame time (ms)').toBeLessThanOrEqual(20)
})
