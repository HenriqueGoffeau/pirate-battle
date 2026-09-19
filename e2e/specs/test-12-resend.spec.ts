import type { Page } from '@playwright/test'
import { expect, test, type MatchOptions, type PbPage } from '../fixtures/pbPage'

const quickMatch: MatchOptions = { sessionSeconds: 60, spawnIntervalSec: 10 }

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

const rankCells = async (page: Page) => (await readRows(page)).map(([rank]) => rank)

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

const describeLog = async (pb: PbPage) =>
  (await pb.requestLog()).map(({ id, method, path, status }) => ({
    id,
    request: `${method} ${path.replace(/\/players\/[^/]+\//, '/players/me/')}`,
    status,
  }))

const rankingPage = (page: number) => `GET /api/ranking?configKey=s120-i3&page=${page}&pageSize=5`

test.describe('TEST-12 resend and late responses: no duplicates, no stale overwrite', () => {
  test('timeoutAfterSave: after the client timeout, Retry now gets the stored record back and nothing is duplicated', async ({
    pb,
    page,
  }) => {
    test.setTimeout(90_000)
    await pb.open('/', { scenario: 'timeoutAfterSave' })
    await pb.startMatch({ options: quickMatch })
    await pb.advance(61_000)
    await expect(page).toHaveURL(/\/result$/)

    const dialog = page.getByRole('dialog', { name: 'You survived the attack' })
    const status = dialog.getByRole('status')
    await expect(status).toHaveText('Saving to the captain’s log…')
    const matchId = await lastMatchId(page)
    expect(await putStatuses(pb, matchId)).toEqual([null])
    expect(await storedCopies(page, matchId)).toBe(1)

    const retry = dialog.getByRole('button', { name: 'Retry now' })
    await retry.waitFor({ timeout: 12_000 })
    await expect(status).toHaveText('Not saved yet')
    await retry.click()
    await expect(status).toHaveText('Saved to the captain’s log')
    expect(await putStatuses(pb, matchId)).toEqual([null, 200])

    await expect.poll(() => putStatuses(pb, matchId), { timeout: 10_000 }).toEqual([201, 200])
    await expect(status).toHaveText('Saved to the captain’s log')
    expect(await storedCopies(page, matchId)).toBe(1)
    expect(await readStored(page, 'pb:v1:outbox')).toEqual([])

    await dialog.getByRole('button', { name: 'Main Menu', exact: true }).click()
    await page.getByRole('button', { name: 'Match History', exact: true }).click()
    await expect.poll(() => readRows(page)).toHaveLength(1)
    expect((await readRows(page))[0].slice(1)).toEqual(['0', '01:00', "Time's up"])
  })

  test('outOfOrder: a late page 1 answer never replaces the newer page 2', async ({ pb, page }) => {
    await pb.open('/log?tab=ranking', { scenario: 'outOfOrder' })
    const panel = page.getByRole('tabpanel')
    const pages = panel.getByRole('navigation', { name: 'Pages' })

    await expect.poll(() => rankCells(page), { timeout: 10_000 }).toEqual(['01', '02', '03', '04', '05'])
    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(panel.getByText('No battles logged yet.', { exact: true })).toBeVisible()

    await page.getByRole('tab', { name: 'Ranking' }).click()
    await expect(panel.getByRole('status')).toHaveText('Refreshing…')
    expect(await rankCells(page)).toEqual(['01', '02', '03', '04', '05'])
    await pages.getByRole('button', { name: 'Next page' }).click()

    await expect.poll(() => rankCells(page)).toEqual(['06', '07', '08', '09', '10'])
    await expect(pages).toHaveText('Page 2 of 3')
    expect(await describeLog(pb)).toEqual([
      { id: 1, request: rankingPage(1), status: 200 },
      { id: 2, request: 'GET /api/players/me/matches?page=1&pageSize=5', status: 200 },
      { id: 3, request: rankingPage(1), status: null },
      { id: 4, request: rankingPage(2), status: 200 },
    ])

    await expect.poll(async () => (await describeLog(pb))[2]?.status, { timeout: 10_000 }).toBe(200)
    await page.waitForTimeout(500)
    await expect(panel.getByRole('status')).toHaveText('')
    expect(await rankCells(page)).toEqual(['06', '07', '08', '09', '10'])
    await expect(pages).toHaveText('Page 2 of 3')
    await expect(panel.getByRole('table')).not.toHaveClass(/dimmed/)
    expect(await describeLog(pb)).toHaveLength(4)
  })
})
