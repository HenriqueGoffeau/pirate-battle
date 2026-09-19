import { test as base, expect, type Page } from '@playwright/test'
import type {
  PbTestApi,
  TestMap,
  TestMatchState,
  TestRequest,
  TestScenarioId,
  TestSnapshot,
} from '../../src/testing/types'

declare global {
  interface Window {
    __PB_TEST__?: PbTestApi
  }
}

export type MatchOptions = { sessionSeconds: number; spawnIntervalSec: number }

export type OpenOptions = { scenario?: TestScenarioId; reset?: boolean }

export type StartOptions = { seed?: number; options?: MatchOptions }

export type PbPage = {
  readonly page: Page
  open(path?: string, options?: OpenOptions): Promise<void>
  waitForApp(): Promise<void>
  allowConsole(pattern: RegExp): void
  setOptions(options: MatchOptions): Promise<void>
  setSeed(seed: number): Promise<void>
  useManualClock(): Promise<void>
  advance(ms: number): Promise<void>
  step(ticks: number): Promise<void>
  hold(code: string, ms: number): Promise<void>
  snapshot(): Promise<TestSnapshot>
  map(): Promise<TestMap>
  state(): Promise<TestMatchState | null>
  waitForState(state: TestMatchState, timeoutMs?: number): Promise<void>
  setScenario(id: TestScenarioId): Promise<void>
  resetServer(): Promise<void>
  requestLog(): Promise<TestRequest[]>
  clearLocal(): Promise<void>
  startMatch(options?: StartOptions): Promise<TestSnapshot>
}

function createPbPage(page: Page, allowed: RegExp[]): PbPage {
  const pb: PbPage = {
    page,
    async open(path = '/', { scenario = 'success', reset = true } = {}) {
      const query = new URLSearchParams({ test: '1', scenario })
      if (reset) query.set('reset', '1')
      await page.goto(`${path}${path.includes('?') ? '&' : '?'}${query}`)
      await pb.waitForApp()
    },
    async waitForApp() {
      await page.waitForSelector('body[data-msw-ready]', { state: 'attached' })
      await page.waitForFunction(() => window.__PB_TEST__ !== undefined)
    },
    allowConsole(pattern) {
      allowed.push(pattern)
    },
    setOptions: (options) => page.evaluate((value) => localStorage.setItem('pb:v1:options', JSON.stringify(value)), options),
    setSeed: (seed) => page.evaluate((value) => window.__PB_TEST__!.setSeed(value), seed),
    useManualClock: () => page.evaluate(() => window.__PB_TEST__!.useManualClock()),
    advance: (ms) => page.evaluate((value) => window.__PB_TEST__!.advance(value), ms),
    step: (ticks) => page.evaluate((value) => window.__PB_TEST__!.step(value), ticks),
    async hold(code, ms) {
      await page.keyboard.down(code)
      await pb.advance(ms)
      await page.keyboard.up(code)
    },
    async snapshot() {
      const snapshot = await page.evaluate(() => window.__PB_TEST__!.getSnapshot())
      if (!snapshot) throw new Error('No match is running, so there is no snapshot.')
      return snapshot
    },
    async map() {
      const map = await page.evaluate(() => window.__PB_TEST__!.getMap())
      if (!map) throw new Error('No match is running, so there is no map.')
      return map
    },
    state: () => page.evaluate(() => window.__PB_TEST__!.getMatchState()),
    waitForState: (state, timeoutMs = 15_000) =>
      page.evaluate(([value, timeout]) => window.__PB_TEST__!.waitForState(value, timeout), [state, timeoutMs] as const),
    setScenario: (id) => page.evaluate((value) => window.__PB_TEST__!.setScenario(value), id),
    resetServer: () => page.evaluate(() => window.__PB_TEST__!.resetServer()),
    requestLog: () => page.evaluate(() => window.__PB_TEST__!.getRequestLog()),
    clearLocal: () => page.evaluate(() => window.__PB_TEST__!.clearLocal()),
    async startMatch({ seed = 42, options } = {}) {
      if (options) await pb.setOptions(options)
      await pb.setSeed(seed)
      await pb.useManualClock()
      await page.getByRole('button', { name: 'Play', exact: true }).click()
      await pb.waitForState('ready', 20_000)
      await pb.step(1)
      expect(await pb.state()).toBe('running')
      return pb.snapshot()
    },
  }
  return pb
}

export const test = base.extend<{ pb: PbPage }>({
  pb: async ({ page }, use) => {
    const allowed: RegExp[] = []
    const problems: string[] = []
    const report = (text: string) => {
      if (!allowed.some((pattern) => pattern.test(text))) problems.push(text)
    }
    page.on('console', (message) => {
      const text = message.text()
      if (message.type() === 'error') report(`console.error: ${text}`)
      else if (message.type() === 'warning' && /^Warning:|React/.test(text)) report(`console.warn: ${text}`)
    })
    page.on('pageerror', (error) => report(`pageerror: ${error.message}`))
    await use(createPbPage(page, allowed))
    expect(problems, 'the console must stay free of errors and React warnings (C-08)').toEqual([])
  },
})

export { expect }
