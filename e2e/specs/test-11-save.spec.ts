import type { Page } from '@playwright/test'
import { expect, survivorSeed, test, type MatchOptions, type PbPage } from '../fixtures/pbPage'

const quickMatch: MatchOptions = { sessionSeconds: 60, spawnIntervalSec: 10 }

const playedAt = /^\d{2} [A-Z]{3} · \d{2}:\d{2}$/

const readRows = (page: Page) =>
  page
    .getByRole('tabpanel')
    .locator('tbody tr:not([aria-hidden="true"])')
    .evaluateAll((rows) =>
      rows.map((row) =>
        Array.from((row as HTMLTableRowElement).cells, (cell) =>
          Array.from(cell.childNodes, (node) => node.textContent ?? '')
            .filter(Boolean)
            .join(' '),
        ),
      ),
    )

const readStored = (page: Page, key: string) =>
  page.evaluate((name) => JSON.parse(localStorage.getItem(name) ?? 'null') as unknown, key)

const lastMatchId = async (page: Page) =>
  ((await readStored(page, 'pb:v1:lastResult')) as { record: { matchId: string } } | null)?.record.matchId ?? ''

const storedCopies = async (page: Page, matchId: string) =>
  ((await readStored(page, 'pb:v1:mockDb')) as { records: Array<{ matchId: string }> }).records.filter(
    (record) => record.matchId === matchId,
  ).length

const putStatuses = async (pb: PbPage, matchId: string) =>
  (await pb.requestLog())
    .filter((entry) => entry.method === 'PUT' && entry.path === `/api/matches/${matchId}`)
    .map((entry) => entry.status)

test.describe('TEST-11 save: a finished match reaches both tabs, and a pending save survives a reload', () => {
  test('success: the match is saved once and both tabs go from empty to showing it', async ({ pb, page }) => {
    await pb.open('/')
    await pb.setOptions(quickMatch)
    const panel = page.getByRole('tabpanel')

    await page.getByRole('button', { name: 'Ranking', exact: true }).click()
    await expect(panel).toContainText('60 second battles · 10 second spawn interval')
    await expect(panel.getByText('No battles logged yet for this configuration.', { exact: true })).toBeVisible()
    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(panel.getByText('No battles logged yet.', { exact: true })).toBeVisible()

    await pb.startMatch({ seed: survivorSeed })
    await pb.advance(61_000)
    await expect(page).toHaveURL(/\/result$/)
    const dialog = page.getByRole('dialog', { name: 'You survived the attack' })
    await expect(dialog.getByRole('status')).toHaveText('Saved to the captain’s log')

    const matchId = await lastMatchId(page)
    expect(matchId).toMatch(/^[0-9a-f-]{36}$/)
    expect(await putStatuses(pb, matchId)).toEqual([201])
    expect(await storedCopies(page, matchId)).toBe(1)
    expect(await readStored(page, 'pb:v1:outbox')).toEqual([])

    await dialog.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Match History', exact: true }).click()
    await expect.poll(() => readRows(page)).toHaveLength(1)
    const [historyRow] = await readRows(page)
    expect(historyRow.slice(1)).toEqual(['0', '01:00', "Time's up"])
    expect(historyRow[0]).toMatch(playedAt)
    await expect(panel.locator('tbody tr[aria-current="true"]')).toHaveCount(1)

    await page.getByRole('tab', { name: 'Ranking' }).click()
    await expect.poll(() => readRows(page)).toEqual([['01', 'Captain Jack You', '0', historyRow[0]]])
    await expect(panel.locator('tbody tr[aria-current="true"]')).toHaveCount(1)
    expect(await putStatuses(pb, matchId)).toEqual([201])
  })

  test('downThenRecover: the save stays pending through a reload with the menu badge, then confirms exactly once', async ({
    pb,
    page,
  }) => {
    test.setTimeout(90_000)
    pb.allowConsole(/Failed to load resource: the server responded with a status of 503/)
    await pb.open('/', { scenario: 'downThenRecover' })
    await pb.startMatch({ seed: survivorSeed, options: quickMatch })
    await pb.advance(61_000)
    await expect(page).toHaveURL(/\/result$/)

    const dialog = page.getByRole('dialog', { name: 'You survived the attack' })
    await expect(dialog.getByRole('status')).toHaveText('Not saved yet')
    await expect(dialog.getByText(/^· retry in \d s$/)).toBeVisible()
    await expect(dialog.getByRole('button', { name: 'Retry now' })).toBeVisible()
    const matchId = await lastMatchId(page)
    const failedBeforeReload = (await putStatuses(pb, matchId)).filter((status) => status !== null)
    expect(failedBeforeReload.length).toBeGreaterThan(0)
    expect(failedBeforeReload.every((status) => status === 503)).toBe(true)
    expect(await storedCopies(page, matchId)).toBe(0)

    await dialog.getByRole('button', { name: 'Main Menu', exact: true }).click()
    const history = page.getByRole('button', { name: /^Match History/ })
    await expect(history).toHaveAccessibleName(/, 1 battle waiting to be saved$/)

    await page.goto('/?test=1')
    await pb.waitForApp()
    await expect(history).toHaveAccessibleName(/, 1 battle waiting to be saved$/)
    expect(await readStored(page, 'pb:v1:outbox')).toMatchObject([{ record: { matchId } }])

    await expect(history).toHaveAccessibleName('Match History', { timeout: 45_000 })
    expect(await putStatuses(pb, matchId)).toEqual([503, 503, 201])
    expect(await storedCopies(page, matchId)).toBe(1)
    expect(await readStored(page, 'pb:v1:outbox')).toEqual([])
    expect(await readStored(page, 'pb:v1:lastResult')).toMatchObject({ record: { matchId }, status: 'saved' })

    await history.click()
    await expect.poll(() => readRows(page)).toHaveLength(1)
    expect((await readRows(page))[0].slice(1)).toEqual(['0', '01:00', "Time's up"])
  })
})
