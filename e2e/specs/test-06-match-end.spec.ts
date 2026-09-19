import type { Page } from '@playwright/test'
import { GameConfig } from '../../src/config/gameConfig'
import type { TestSnapshot } from '../../src/testing/types'
import { expect, survivorSeed, test, type PbPage } from '../fixtures/pbPage'

const look = (page: Page, ms: number): Promise<TestSnapshot> =>
  page.evaluate((value) => {
    window.__PB_TEST__!.advance(value)
    return window.__PB_TEST__!.getSnapshot()!
  }, ms)

const clockOf = (time: number) =>
  [Math.floor(time / 60), Math.floor(time) % 60].map((part) => String(part).padStart(2, '0')).join(':')

async function sailUntilSunk(pb: PbPage, limitSec: number): Promise<TestSnapshot> {
  for (let elapsed = 0; elapsed < limitSec; elapsed += 5) {
    const frame = await look(pb.page, 5000)
    if (frame.ended) return frame
  }
  throw new Error(`The match did not end within ${limitSec} s of sim time.`)
}

test.describe('TEST-06 match end: time up, defeat, the simulation stopping, a clean restart', () => {
  test('time running out ends the match as a survival and freezes the simulation', async ({ pb, page }) => {
    const options = { sessionSeconds: 60, spawnIntervalSec: 10 }
    await pb.open('/')
    await pb.startMatch({ seed: survivorSeed, options })

    const almost = await look(page, (options.sessionSeconds - 0.1) * 1000)
    expect(almost).toMatchObject({ state: 'running', ended: false, endReason: null, timeLeftSec: 1 })
    const ended = await look(page, 1100)
    expect(ended).toMatchObject({ state: 'ended', ended: true, endReason: 'timeUp', timeLeftSec: 0 })
    expect(ended.time).toBeGreaterThanOrEqual(options.sessionSeconds)
    expect(ended.time).toBeLessThan(options.sessionSeconds + 2 / 60)
    expect(ended.player.health).toBeGreaterThan(0)
    expect(ended.enemies.length).toBeGreaterThan(0)

    const frozen = await look(page, 5000)
    expect(frozen).toEqual(ended)

    const dialog = page.getByRole('dialog', { name: 'You survived the attack' })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(/\/result$/)
    await expect(dialog.getByText(String(ended.score), { exact: true })).toBeVisible()
    await expect(dialog).toContainText(`Points · ${clockOf(ended.time)} · Time's up`)
    expect(await pb.snapshot()).toEqual(ended)
  })

  test('an idle player under a 1 s spawn interval is eventually sunk and the match ends as a defeat', async ({ pb, page }) => {
    await pb.open('/')
    await pb.startMatch({ seed: 42, options: { sessionSeconds: 120, spawnIntervalSec: 1 } })

    const sunk = await sailUntilSunk(pb, 120)
    expect(sunk).toMatchObject({ state: 'ended', endReason: 'defeated', score: 0 })
    expect(sunk.player).toMatchObject({ health: 0, alive: false })
    expect(sunk.time).toBeLessThan(sunk.config.sessionSeconds)

    const frozen = await look(page, 5000)
    expect(frozen).toEqual(sunk)

    const dialog = page.getByRole('dialog', { name: 'Your ship was sunk' })
    await expect(dialog).toBeVisible()
    await expect(page).toHaveURL(/\/result$/)
    await expect(dialog.getByText('0', { exact: true })).toBeVisible()
    await expect(dialog).toContainText(`Points · ${clockOf(sunk.time)} · Defeated`)
    await expect(dialog.getByRole('button', { name: 'Play Again' })).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Main Menu' })).toBeVisible()
  })

  test('Play Again after a lost battle with a kill starts a brand-new match', async ({ pb, page }) => {
    const options = { sessionSeconds: 120, spawnIntervalSec: 1 }
    const seed = 50
    await pb.open('/')
    const first = await pb.startMatch({ seed, options })
    const map = await pb.map()

    await page.keyboard.down('Space')
    const sunk = await sailUntilSunk(pb, 120)
    await page.keyboard.up('Space')
    expect(sunk.endReason).toBe('defeated')
    expect(sunk.score).toBeGreaterThan(0)
    expect(sunk.enemies.length).toBeGreaterThan(0)

    const dialog = page.getByRole('dialog', { name: 'Your ship was sunk' })
    await expect(dialog.getByText(String(sunk.score), { exact: true })).toBeVisible()
    await dialog.getByRole('button', { name: 'Play Again' }).click()
    await pb.waitForState('ready')
    await pb.step(1)
    await expect(page).toHaveURL(/\/play/)
    await expect(dialog).toBeHidden()

    const fresh = await pb.snapshot()
    expect(fresh).toMatchObject({
      state: 'running',
      time: 0,
      score: 0,
      timeLeftSec: options.sessionSeconds,
      ended: false,
      endReason: null,
      enemies: [],
      projectiles: [],
      spawns: { count: 0, nextAt: options.spawnIntervalSec },
      config: { sessionSeconds: options.sessionSeconds, spawnIntervalSec: options.spawnIntervalSec, seed },
    })
    expect(fresh.player).toMatchObject({
      x: map.playerStart.x,
      y: map.playerStart.y,
      speed: 0,
      health: GameConfig.player.maxHealth,
      alive: true,
      cooldowns: { front: 0, left: 0, right: 0 },
    })
    expect(fresh.player.id).toBe(first.player.id)

    const next = await look(page, 1000)
    expect(next).toMatchObject({ state: 'running', score: 0 })
    expect(next.time).toBeCloseTo(1, 6)
  })
})
