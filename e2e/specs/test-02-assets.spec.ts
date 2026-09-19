import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/pbPage'

const shipsAtlas = '**/assets/ships.json'
const combatAssets = /\/(assets|maps)\/[^/?]+\.(json|png)(\?.*)?$/

const loadingBar = (page: Page) => page.getByRole('progressbar', { name: 'Loading the fleet…' })

async function clickPlay(page: Page) {
  await page.getByRole('button', { name: 'Play', exact: true }).click()
}

test.describe('TEST-02 assets: loading state, failure and retry', () => {
  test('Play shows the loading progress until the atlas arrives, then the match is ready', async ({ pb, page }) => {
    let release = () => {}
    const held = new Promise<void>((resolve) => {
      release = resolve
    })
    await page.context().route(shipsAtlas, async (route) => {
      await held
      await route.continue()
    })
    await pb.open('/')
    await pb.setSeed(42)
    await pb.useManualClock()
    await clickPlay(page)

    await pb.waitForState('loading')
    const bar = loadingBar(page)
    await expect(bar).toBeVisible()
    await expect(bar).toHaveAttribute('aria-valuenow', /^\d+$/)
    await expect.poll(async () => Number(await bar.getAttribute('aria-valuenow'))).toBeGreaterThan(0)
    expect(Number(await bar.getAttribute('aria-valuenow'))).toBeLessThan(100)
    expect(await pb.state()).toBe('loading')
    await expect(page.locator('canvas')).toHaveCount(0)

    release()
    await pb.waitForState('ready')
    await expect(bar).toBeHidden()
    await expect(page.getByRole('img', { name: 'Battle arena' })).toBeVisible()
    await pb.step(1)
    expect((await pb.snapshot()).state).toBe('running')
  })

  test('an aborted atlas shows the error panel with Retry, and Retry then loads the match', async ({ pb, page }) => {
    pb.allowConsole(/Failed to load resource: net::ERR_FAILED/)
    await page.context().route(shipsAtlas, (route) => route.abort())
    await pb.open('/')
    await pb.setSeed(42)
    await pb.useManualClock()
    await clickPlay(page)

    await pb.waitForState('assetError')
    const alert = page.getByRole('alert')
    await expect(alert).toContainText('The fleet could not be loaded.')
    await expect(alert).toContainText('Check your connection and try again.')
    await expect(page.getByRole('button', { name: 'Main Menu', exact: true })).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
    expect(await page.evaluate(() => window.__PB_TEST__!.getSnapshot())).toBeNull()

    await page.context().unroute(shipsAtlas)
    await page.getByRole('button', { name: 'Retry', exact: true }).click()
    await pb.waitForState('ready')
    await expect(alert).toBeHidden()
    await expect(page.locator('canvas')).toHaveCount(1)
    await pb.step(1)
    await pb.hold('KeyW', 1000)
    const snapshot = await pb.snapshot()
    expect(snapshot.state).toBe('running')
    expect(snapshot.player.speed).toBeGreaterThan(0)
  })

  test('textures load once: a second match in the same page fetches no assets', async ({ pb, page }) => {
    const fetched: string[] = []
    await page.context().route(combatAssets, (route) => {
      fetched.push(new URL(route.request().url()).pathname)
      return route.continue()
    })
    await pb.open('/')
    await pb.startMatch()
    expect(fetched).toContain('/assets/ships.json')
    const firstLoad = [...fetched]

    await page.keyboard.press('KeyP')
    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await expect(page).toHaveURL((url) => url.pathname === '/')
    await expect(page.locator('canvas')).toHaveCount(0)

    const second = await pb.startMatch()
    expect(fetched).toEqual(firstLoad)
    expect(second.state).toBe('running')
    await expect(page.getByRole('img', { name: 'Battle arena' })).toBeVisible()
  })
})
