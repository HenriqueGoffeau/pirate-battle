import type { Page } from '@playwright/test'
import { expect, test, type PbPage } from '../fixtures/pbPage'

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

const countGets = async (pb: PbPage, pattern: RegExp) =>
  (await pb.requestLog()).filter((entry) => entry.method === 'GET' && pattern.test(entry.path) && entry.status === 200).length

const rankingPage1 = /^\/api\/ranking\?configKey=s120-i3&page=1&/
const historyPage1 = /^\/api\/players\/[^/]+\/matches\?page=1&/

const manyRanking1 = [
  ['01', 'Captain Flint', '38', '08 SEP · 16:42'],
  ['02', 'Red Sparrow', '32', '07 SEP · 17:15'],
  ['03', 'Captain Jack You', '24', '08 SEP · 18:42'],
  ['04', 'Storm Rider', '21', '06 SEP · 15:03'],
  ['05', 'Sea Wolf', '19', '04 SEP · 14:48'],
]

const manyRanking2 = [
  ['06', 'Anne Bonny', '17', '03 SEP · 19:10'],
  ['07', 'Captain Jack You', '16', '07 SEP · 16:05'],
  ['08', 'Iron Kate', '15', '05 SEP · 18:30'],
  ['09', 'Black Bart', '15', '03 SEP · 10:25'],
  ['10', 'Tide Runner', '12', '02 SEP · 13:40'],
]

const manyHistory1 = [
  ['08 SEP · 18:42', '24', '02:00', "Time's up"],
  ['07 SEP · 16:05', '16', '02:00', "Time's up"],
  ['06 SEP · 17:30', '7', '00:58', 'Defeated'],
  ['05 SEP · 15:12', '30', '03:00', "Time's up"],
  ['04 SEP · 18:00', '12', '01:37', 'Defeated'],
]

const manyHistory2 = [
  ['03 SEP · 14:25', '19', '03:00', "Time's up"],
  ['02 SEP · 19:48', '5', '00:40', 'Defeated'],
]

const fixtureRanks1 = ['01 Captain Flint', '02 Red Sparrow', '03 Storm Rider', '04 Sea Wolf', '05 Anne Bonny']
const fixtureRanks2 = ['06 Iron Kate', '07 Black Bart', '08 Tide Runner', '09 Gull Eye', '10 Coral Fang']

const rankAndName = async (page: Page) => (await readRows(page)).map(([rank, name]) => `${rank} ${name}`)

test.describe('TEST-10 log tabs: loading, paging, empty and error states', () => {
  test('manyPages: both tabs page through their records, your rows carry the You pill, and a tab shown again refetches', async ({
    pb,
    page,
  }) => {
    await pb.open('/', { scenario: 'manyPages' })
    await page.getByRole('button', { name: 'Ranking', exact: true }).click()
    await expect(page).toHaveURL(/\/log\?tab=ranking$/)

    const panel = page.getByRole('tabpanel')
    const pages = panel.getByRole('navigation', { name: 'Pages' })
    const previous = pages.getByRole('button', { name: 'Previous page' })
    const next = pages.getByRole('button', { name: 'Next page' })
    const current = panel.locator('tbody tr[aria-current="true"]')

    await expect(page.getByRole('tab', { name: 'Ranking' })).toHaveAttribute('aria-selected', 'true')
    await expect(panel).toContainText('120 second battles · 3 second spawn interval')
    await expect.poll(() => readRows(page)).toEqual(manyRanking1)
    await expect(pages).toHaveText('Page 1 of 3')
    await expect(previous).toBeDisabled()
    await expect(panel.locator('tbody td:first-child span')).toHaveCount(1)
    await expect(panel.locator('tbody tr').first().locator('td:first-child span')).toHaveCount(1)
    await expect(current).toHaveCount(1)
    await expect(current.locator('td').first()).toHaveText('03')

    await next.click()
    await expect.poll(() => readRows(page)).toEqual(manyRanking2)
    await expect(pages).toHaveText('Page 2 of 3')
    await expect(panel.locator('tbody td:first-child span')).toHaveCount(0)
    await expect(current).toHaveCount(1)
    await expect(current.locator('td').first()).toHaveText('07')

    await previous.click()
    await expect.poll(() => readRows(page)).toEqual(manyRanking1)
    await expect(pages).toHaveText('Page 1 of 3')

    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(page).toHaveURL(/\/log\?tab=history$/)
    await expect(panel).toContainText('Captain Jack · your recent battles')
    await expect.poll(() => readRows(page)).toEqual(manyHistory1)
    await expect(pages).toHaveText('Page 1 of 2')
    await expect(current).toHaveCount(1)
    await expect(current.locator('td').first()).toHaveText('08 SEP · 18:42')

    await next.click()
    await expect.poll(() => readRows(page)).toEqual(manyHistory2)
    await expect(pages).toHaveText('Page 2 of 2')
    await expect(next).toBeDisabled()
    await expect(current).toHaveCount(0)

    const rankingBefore = await countGets(pb, rankingPage1)
    await page.getByRole('tab', { name: 'Ranking' }).click()
    await expect.poll(() => countGets(pb, rankingPage1)).toBe(rankingBefore + 1)
    await expect.poll(() => readRows(page)).toEqual(manyRanking1)

    const historyBefore = await countGets(pb, historyPage1)
    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect.poll(() => countGets(pb, historyPage1)).toBe(historyBefore + 1)
    await expect.poll(() => readRows(page)).toEqual(manyHistory1)
  })

  test('empty lists offer Play; a failing ranking shows the skeleton, then its error with Retry, while Match History still loads', async ({
    pb,
    page,
  }) => {
    pb.allowConsole(/Failed to load resource: the server responded with a status of 503/)
    const panel = page.getByRole('tabpanel')

    await pb.open('/log?tab=ranking', { scenario: 'empty' })
    await expect(panel.getByText('No battles logged yet for this configuration.', { exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Play', exact: true })).toBeVisible()
    await expect(panel.getByRole('table')).toHaveCount(0)
    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(panel.getByText('No battles logged yet.', { exact: true })).toBeVisible()
    await expect(panel.getByRole('button', { name: 'Play', exact: true })).toBeVisible()

    await pb.open('/log?tab=history', { scenario: 'rankingFails' })
    await expect(panel.getByText('No battles logged yet.', { exact: true })).toBeVisible()
    await expect(panel.getByRole('alert')).toHaveCount(0)
    expect(await countGets(pb, historyPage1)).toBe(1)

    await page.getByRole('tab', { name: 'Ranking' }).click()
    await expect(panel.locator('tbody tr[aria-hidden="true"]')).toHaveCount(5)
    await expect(panel.getByRole('status')).toHaveText('Loading…')
    const alert = panel.getByRole('alert')
    await expect(alert).toContainText('Couldn’t load the ranking. The service is unavailable. Try again shortly.')
    await expect(alert.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    await expect(panel.getByRole('table')).toHaveCount(0)
    const rankingRequests = (await pb.requestLog()).filter((entry) => entry.path.startsWith('/api/ranking?'))
    expect(rankingRequests.map((entry) => entry.status)).toEqual([503, 503, 503])

    await pb.setScenario('success')
    await alert.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect.poll(() => rankAndName(page)).toEqual(fixtureRanks1)
    await expect(panel.getByRole('alert')).toHaveCount(0)
    expect(await countGets(pb, rankingPage1)).toBe(1)
  })

  test('historyFails: Match History shows the skeleton, then its error with Retry, while the Ranking still loads', async ({
    pb,
    page,
  }) => {
    pb.allowConsole(/Failed to load resource: the server responded with a status of 503/)
    const panel = page.getByRole('tabpanel')

    await pb.open('/log?tab=ranking', { scenario: 'historyFails' })
    await expect.poll(() => rankAndName(page)).toEqual(fixtureRanks1)
    await expect(panel.getByRole('alert')).toHaveCount(0)

    await page.getByRole('tab', { name: 'Match History' }).click()
    await expect(panel.locator('tbody tr[aria-hidden="true"]')).toHaveCount(5)
    await expect(panel.getByRole('status')).toHaveText('Loading…')
    const alert = panel.getByRole('alert')
    await expect(alert).toContainText('Couldn’t load your match history. The service is unavailable. Try again shortly.')
    await expect(alert.getByRole('button', { name: 'Retry', exact: true })).toBeVisible()
    await expect(panel.getByRole('table')).toHaveCount(0)
    const historyRequests = (await pb.requestLog()).filter((entry) => /^\/api\/players\/[^/]+\/matches\?/.test(entry.path))
    expect(historyRequests.map((entry) => entry.status)).toEqual([503, 503, 503])

    await pb.setScenario('success')
    await alert.getByRole('button', { name: 'Retry', exact: true }).click()
    await expect(panel.getByText('No battles logged yet.', { exact: true })).toBeVisible()
    await expect(panel.getByRole('alert')).toHaveCount(0)
    expect(await countGets(pb, historyPage1)).toBe(1)
  })

  test('slow: the skeleton and Loading… come first, and paging keeps the previous page dimmed with disabled arrows until the next one arrives', async ({
    pb,
    page,
  }) => {
    await pb.open('/log?tab=ranking', { scenario: 'slow' })
    const panel = page.getByRole('tabpanel')
    const table = panel.getByRole('table', { name: 'Ranking' })
    const status = panel.getByRole('status')
    const pages = panel.getByRole('navigation', { name: 'Pages' })
    const previous = pages.getByRole('button', { name: 'Previous page' })
    const next = pages.getByRole('button', { name: 'Next page' })

    await expect(panel.locator('tbody tr[aria-hidden="true"]')).toHaveCount(5)
    await expect(status).toHaveText('Loading…')
    await expect(table).toHaveAttribute('aria-busy', 'true')
    await expect(pages).toHaveCount(0)

    await expect.poll(() => rankAndName(page), { timeout: 10_000 }).toEqual(fixtureRanks1)
    await expect(status).toHaveText('')
    await expect(table).toHaveAttribute('aria-busy', 'false')
    await expect(pages).toHaveText('Page 1 of 3')

    await next.click()
    await expect(table).toHaveClass(/dimmed/)
    await expect(pages).toHaveText('Page 2 of 3')
    await expect(previous).toBeDisabled()
    await expect(next).toBeDisabled()
    await expect(status).toHaveText('Refreshing…')
    expect(await rankAndName(page)).toEqual(fixtureRanks1)

    await expect.poll(() => rankAndName(page), { timeout: 10_000 }).toEqual(fixtureRanks2)
    await expect(table).not.toHaveClass(/dimmed/)
    await expect(previous).toBeEnabled()
    await expect(next).toBeEnabled()
    await expect(status).toHaveText('')
  })
})
