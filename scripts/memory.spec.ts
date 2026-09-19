import { mkdirSync, writeFileSync } from 'node:fs'
import { expect, test, type CDPSession, type Page } from '@playwright/test'
import { GameConfig } from '../src/config/gameConfig'
import { defaultOptions } from '../src/config/userOptions'

type CycleRow = {
  cycle: number
  heapUsedMB: number
  jsHeapUsedMB: number
  domNodes: number
  jsEventListeners: number
  documents: number
  canvases: number
}

const reportPath = 'docs/perf/memory-run.json'
const cycles = 5
const playMs = 20_000
const growthLimit = 1.1
const survivorHealth = 100_000
const balance = { ...GameConfig, player: { ...GameConfig.player, maxHealth: survivorHealth } }
const bytesPerMB = 1024 * 1024
const toMB = (bytes: number) => Math.round((bytes / bytesPerMB) * 100) / 100

async function measure(page: Page, cdp: CDPSession, cycle: number): Promise<CycleRow> {
  await cdp.send('HeapProfiler.collectGarbage')
  await cdp.send('HeapProfiler.collectGarbage')
  const { usedSize } = await cdp.send('Runtime.getHeapUsage')
  const { metrics } = await cdp.send('Performance.getMetrics')
  const metric = (name: string) => metrics.find((entry) => entry.name === name)?.value ?? 0
  return {
    cycle,
    heapUsedMB: toMB(usedSize),
    jsHeapUsedMB: toMB(metric('JSHeapUsedSize')),
    domNodes: metric('Nodes'),
    jsEventListeners: metric('JSEventListeners'),
    documents: metric('Documents'),
    canvases: await page.locator('canvas').count(),
  }
}

async function sail(page: Page, ms: number): Promise<void> {
  const end = Date.now() + ms
  await page.keyboard.down('KeyW')
  await page.keyboard.down('Space')
  for (let turn = 0; Date.now() < end; turn += 1) {
    const broadside = turn % 2 === 0 ? 'KeyQ' : 'KeyE'
    await page.keyboard.down('KeyD')
    await page.keyboard.down(broadside)
    await page.waitForTimeout(Math.max(0, Math.min(1_000, end - Date.now())))
    await page.keyboard.up(broadside)
    await page.keyboard.up('KeyD')
    await page.waitForTimeout(Math.max(0, Math.min(2_000, end - Date.now())))
  }
  await page.keyboard.up('Space')
  await page.keyboard.up('KeyW')
}

async function playAndAbandon(page: Page): Promise<void> {
  await page.getByRole('button', { name: 'Play', exact: true }).click()
  await expect(page.getByRole('button', { name: 'Pause' })).toBeEnabled({ timeout: 30_000 })
  await sail(page, playMs)
  const mainMenu = page.getByRole('dialog').getByRole('button', { name: 'Main Menu' })
  if (!(await mainMenu.isVisible())) await page.getByRole('button', { name: 'Pause' }).click()
  await mainMenu.click()
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
}

test('five play → menu cycles keep the heap flat (PERF-03)', async ({ page, browser, browserName }) => {
  await page.addInitScript((value) => {
    localStorage.removeItem('pb:v1:options')
    localStorage.setItem('pb:v1:dev', 'true')
    localStorage.setItem('pb:v1:devBalance', JSON.stringify(value))
  }, balance)
  await page.goto('/')
  await page.waitForSelector('body[data-msw-ready]', { state: 'attached' })
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  const cdp = await page.context().newCDPSession(page)
  await cdp.send('Performance.enable')

  const rows = [await measure(page, cdp, 0)]
  for (let cycle = 1; cycle <= cycles; cycle += 1) {
    await playAndAbandon(page)
    rows.push(await measure(page, cdp, cycle))
  }

  const heapOf = (cycle: number) => rows.find((row) => row.cycle === cycle)?.heapUsedMB ?? Number.NaN
  const limitMB = Math.round(heapOf(2) * growthLimit * 100) / 100
  const pass = heapOf(cycles) <= limitMB
  mkdirSync('docs/perf', { recursive: true })
  writeFileSync(
    reportPath,
    `${JSON.stringify(
      {
        meta: {
          createdAt: new Date().toISOString(),
          browser: { name: browserName, version: browser.version(), headless: process.env.PERF_HEADLESS === '1' },
          viewport: page.viewportSize(),
          options: defaultOptions,
          balanceOverride: { 'player.maxHealth': { value: survivorHealth, default: GameConfig.player.maxHealth } },
          cycles,
          playSeconds: playMs / 1000,
          method:
            'Menu → Play → sail and fire for 20 s → Pause → Main Menu; then HeapProfiler.collectGarbage ×2, Runtime.getHeapUsage and Performance.getMetrics. Cycle 0 is the menu before the first match.',
        },
        rows,
        verdict: { rule: `heap(${cycles}) ≤ heap(2) × ${growthLimit}`, heap2MB: heapOf(2), heap5MB: heapOf(cycles), limitMB, pass },
      },
      null,
      2,
    )}\n`,
  )

  for (const row of rows) expect.soft(row.canvases, `canvases after cycle ${row.cycle}`).toBe(0)
  expect.soft(heapOf(cycles), `heap(${cycles}) ≤ heap(2) × ${growthLimit}`).toBeLessThanOrEqual(limitMB)
})
