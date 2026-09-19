import type { Page } from '@playwright/test'
import { expect, test, type PbPage } from '../fixtures/pbPage'

const shortMatch = { sessionSeconds: 60, spawnIntervalSec: 10 }
const saving = 'Saving to the captain’s log…'
const saved = 'Saved to the captain’s log'

type StoredResult = {
  record: { matchId: string; score: number; effectiveSec: number; endReason: string }
  status: string
}

const readStored = (page: Page, key: string) =>
  page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? 'null') as unknown, key)

const readLastResult = async (page: Page) => (await readStored(page, 'pb:v1:lastResult')) as StoredResult | null

const resultDialog = (page: Page) => page.getByRole('dialog', { name: 'You survived the attack' })

const onPath = (path: string) => (url: URL) => url.pathname === path

async function playToTimeUp(pb: PbPage) {
  await pb.startMatch({ options: shortMatch })
  await pb.advance(61_000)
  const final = await pb.snapshot()
  expect(final).toMatchObject({ state: 'ended', ended: true, endReason: 'timeUp' })
  return final
}

async function expectSummary(page: Page, score: number) {
  const dialog = resultDialog(page)
  await expect(dialog).toBeVisible()
  await expect(dialog.getByText(String(score), { exact: true })).toBeVisible()
  await expect(dialog.getByText(/^Points ·/)).toHaveText("Points · 01:00 · Time's up")
  await expect(dialog.locator('time')).toHaveAttribute('datetime', 'PT60S')
}

test.describe('TEST-08 result: summary, save status, persistence, actions', () => {
  test("after time-up the Result shows the final score, 01:00 and Time's up, and the record is saved once", async ({
    pb,
    page,
  }) => {
    await pb.open('/', { scenario: 'slow' })
    const final = await playToTimeUp(pb)
    expect(Math.floor(final.time)).toBe(60)
    const stored = await readLastResult(page)
    expect(stored?.record).toMatchObject({ score: final.score, effectiveSec: 60, endReason: 'timeUp' })

    await expect(page).toHaveURL(onPath('/result'))
    await expectSummary(page, final.score)
    const dialog = resultDialog(page)
    await expect(dialog.getByRole('button', { name: 'Play Again', exact: true })).toBeFocused()
    const status = dialog.getByRole('status')
    await expect(status).toHaveText(saving)
    await expect(status).toHaveText(saved)

    const puts = (await pb.requestLog()).filter((entry) => entry.method === 'PUT')
    expect(puts).toEqual([expect.objectContaining({ path: `/api/matches/${stored?.record.matchId}`, status: 201 })])
    expect(await readLastResult(page)).toMatchObject({ status: 'saved', record: { matchId: stored?.record.matchId } })
    expect(await readStored(page, 'pb:v1:outbox')).toEqual([])
  })

  test('a reload of /result shows the same result over the final frame, and a fresh visit shows it from storage (CFG-07)', async ({
    pb,
    page,
  }) => {
    await pb.open('/')
    const final = await playToTimeUp(pb)
    await expect(resultDialog(page).getByRole('status')).toHaveText(saved)
    const stored = await readLastResult(page)
    const endFrame = page.locator('[style*="data:image/jpeg"]')

    await page.reload()
    await expect(page).toHaveURL(onPath('/result'))
    await expectSummary(page, final.score)
    await expect(resultDialog(page).getByRole('status')).toHaveText(saved)
    await expect(page.locator('canvas')).toHaveCount(0)
    await expect(endFrame).toHaveCount(1)

    await page.goto('/result?test=1')
    await pb.waitForApp()
    await expectSummary(page, final.score)
    await expect(resultDialog(page).getByRole('status')).toHaveText(saved)
    await expect(endFrame).toHaveCount(0)
    expect(await readLastResult(page)).toEqual(stored)
    expect((await pb.requestLog()).filter((entry) => entry.method === 'PUT')).toEqual([])
  })

  test('Play Again starts a fresh match and Main Menu returns to the menu', async ({ pb, page }) => {
    await pb.open('/')
    const first = await playToTimeUp(pb)
    const dialog = resultDialog(page)
    await expect(dialog.getByRole('status')).toHaveText(saved)

    await dialog.getByRole('button', { name: 'Play Again', exact: true }).click()
    await expect(page).toHaveURL(onPath('/play'))
    await pb.waitForState('ready')
    await pb.step(1)
    const fresh = await pb.snapshot()
    expect(fresh).toMatchObject({ state: 'running', time: 0, score: 0, ended: false, endReason: null, timeLeftSec: 60 })
    expect(fresh.player.health).toBe(fresh.player.maxHealth)
    expect(first.player.health).toBeLessThan(first.player.maxHealth)
    expect(fresh.projectiles).toEqual([])
    await expect(dialog).toBeHidden()
    await expect(page.locator('canvas')).toHaveCount(1)

    await pb.advance(61_000)
    expect((await pb.snapshot()).endReason).toBe('timeUp')
    await expect(page).toHaveURL(onPath('/result'))
    await expect(dialog.getByRole('status')).toHaveText(saved)
    await dialog.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await expect(page).toHaveURL(onPath('/'))
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect(page.locator('canvas')).toHaveCount(0)
    expect(await pb.state()).toBeNull()

    const puts = (await pb.requestLog()).filter((entry) => entry.method === 'PUT')
    expect(puts.map((entry) => entry.status)).toEqual([201, 201])
    expect(new Set(puts.map((entry) => entry.path)).size).toBe(2)

    await page.goBack()
    await expect(page).toHaveURL(onPath('/'))
    await expect(page.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
  })
})
