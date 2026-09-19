import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/pbPage'

const onPath = (path: string) => (url: URL) => url.pathname === path

const gameplayListeners = ['window:keydown', 'window:keyup', 'window:blur', 'document:visibilitychange']

const readStored = (page: Page, key: string) =>
  page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? 'null') as unknown, key)

async function expectNothingRecorded(page: Page) {
  expect(await readStored(page, 'pb:v1:lastResult')).toBeNull()
  expect((await readStored(page, 'pb:v1:outbox')) ?? []).toEqual([])
}

async function expectMenuWithoutMatch(page: Page) {
  await expect(page).toHaveURL(onPath('/'))
  await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  await expect(page.locator('canvas')).toHaveCount(0)
}

async function globalListeners(page: Page) {
  const cdp = await page.context().newCDPSession(page)
  const types: string[] = []
  for (const target of ['window', 'document']) {
    const { result } = await cdp.send('Runtime.evaluate', { expression: target })
    const { listeners } = await cdp.send('DOMDebugger.getEventListeners', { objectId: result.objectId! })
    types.push(...listeners.map((listener) => `${target}:${listener.type}`))
  }
  await cdp.detach()
  return types.sort()
}

async function trackCanvasPeak(page: Page) {
  await page.evaluate(() => {
    let peak = document.querySelectorAll('canvas').length
    const count = () => {
      peak = Math.max(peak, document.querySelectorAll('canvas').length)
    }
    new MutationObserver(count).observe(document.body, { childList: true, subtree: true })
    Object.defineProperty(window, 'pbCanvasPeak', { configurable: true, get: () => peak })
  })
  return () => page.evaluate(() => (window as unknown as { pbCanvasPeak: number }).pbCanvasPeak)
}

test.describe('TEST-09 navigation: abandoning, repeated visits, reloads, touch', () => {
  test('leaving mid-match through Pause → Main Menu records nothing (CFG-06)', async ({ pb, page }) => {
    await pb.open('/')
    await pb.startMatch()
    await pb.advance(3000)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    await page.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Main Menu', exact: true }).click()

    await expectMenuWithoutMatch(page)
    expect(await pb.state()).toBeNull()
    await expectNothingRecorded(page)

    await page.getByRole('button', { name: 'Match History' }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/log' && url.searchParams.get('tab') === 'history')
    await expect(page.getByText('No battles logged yet.', { exact: true })).toBeVisible()
    const requests = await pb.requestLog()
    expect(requests.some((entry) => entry.method === 'GET' && /^\/api\/players\/[^/]+\/matches/.test(entry.path))).toBe(true)
    expect(requests.filter((entry) => entry.method === 'PUT')).toEqual([])
  })

  test('menu ↔ play ten times keeps at most one canvas and releases every listener (ARCH-07/08)', async ({ pb, page }) => {
    await pb.open('/')
    await pb.setSeed(42)
    await pb.useManualClock()
    const baseline = await globalListeners(page)
    expect(baseline).not.toContain('window:keydown')
    const canvasPeak = await trackCanvasPeak(page)

    for (let round = 1; round <= 10; round++) {
      await page.getByRole('button', { name: 'Play', exact: true }).click()
      await expect(page).toHaveURL(onPath('/play'))
      await pb.waitForState('ready', 20_000)
      await expect(page.locator('canvas')).toHaveCount(1)
      await pb.step(30)
      expect(await pb.state()).toBe('running')
      if (round === 1) expect(await globalListeners(page)).toEqual(expect.arrayContaining(gameplayListeners))
      if (round % 2 === 1) {
        await page.getByRole('button', { name: 'Pause', exact: true }).click()
        await page.getByRole('dialog', { name: 'Paused' }).getByRole('button', { name: 'Main Menu', exact: true }).click()
      } else {
        await page.goBack()
      }
      await expectMenuWithoutMatch(page)
      expect(await pb.state()).toBeNull()
    }

    expect(await canvasPeak()).toBe(1)
    expect(await globalListeners(page)).toEqual(baseline)
    await expectNothingRecorded(page)
  })

  test('Forward, a reload or a typed URL onto /play lands on the menu without a match', async ({ pb, page }) => {
    await pb.open('/')
    await pb.startMatch()
    await page.goBack()
    await expectMenuWithoutMatch(page)
    await page.goForward()
    await expectMenuWithoutMatch(page)
    expect(await pb.state()).toBeNull()

    await pb.startMatch()
    await pb.advance(2000)
    await page.reload()
    await expectMenuWithoutMatch(page)

    await page.goto('/play?test=1')
    await pb.waitForApp()
    await expectMenuWithoutMatch(page)
    expect(await pb.state()).toBeNull()
    await expectNothingRecorded(page)
  })

  test('touch: Sail forward and Broadside left held together sail and fire the left broadside', async ({ pb, page }, testInfo) => {
    test.skip(testInfo.project.name !== 'mobile', 'The touch controls exist only on coarse pointers.')
    await pb.open('/')
    const start = await pb.startMatch()
    const forward = page.getByRole('button', { name: 'Sail forward', exact: true })
    const broadside = page.getByRole('button', { name: 'Broadside left', exact: true })
    await expect(forward).toBeVisible()
    await expect(broadside).toBeVisible()
    const centreOf = async (button: typeof forward, id: number) => {
      const box = await button.boundingBox()
      if (!box) throw new Error('The touch button has no box.')
      return { x: box.x + box.width / 2, y: box.y + box.height / 2, id }
    }
    const touchPoints = [await centreOf(forward, 1), await centreOf(broadside, 2)]
    const cdp = await page.context().newCDPSession(page)

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints })
    await pb.advance(500)
    const held = await pb.snapshot()
    expect(held.player.speed).toBeGreaterThan(0)
    expect(held.player.turnVelocity).toBe(0)
    expect(Math.cos(held.player.heading)).toBeCloseTo(Math.cos(start.player.heading), 6)
    expect(Math.sin(held.player.heading)).toBeCloseTo(Math.sin(start.player.heading), 6)
    const volley = held.projectiles.filter((shot) => shot.faction === 'player')
    expect(volley).toHaveLength(3)
    const port = held.player.heading - Math.PI / 2
    for (const shot of volley) {
      expect(shot.ownerId).toBe(held.player.id)
      expect(shot.dirX).toBeCloseTo(Math.cos(port), 6)
      expect(shot.dirY).toBeCloseTo(Math.sin(port), 6)
    }
    expect(held.player.cooldowns.left).toBeGreaterThan(0)
    expect(held.player.cooldowns.front).toBe(0)

    await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] })
    await pb.advance(1500)
    const released = await pb.snapshot()
    expect(released.player.speed).toBe(0)
    expect(released.player.cooldowns.left).toBe(0)
    expect(released.projectiles.filter((shot) => shot.faction === 'player')).toEqual([])
    await cdp.detach()
  })
})
