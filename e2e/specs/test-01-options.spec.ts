import { expect, test } from '../fixtures/pbPage'

const readStoredOptions = (page: import('@playwright/test').Page) =>
  page.evaluate(() => localStorage.getItem('pb:v1:options'))

test.describe('TEST-01 options: navigation, validation, persistence', () => {
  test('steppers stop at the limits and an invalid value is explained and never saved', async ({ pb, page }) => {
    await pb.open('/')
    await page.getByRole('button', { name: 'Options', exact: true }).click()
    await expect(page).toHaveURL(/\/options$/)
    await expect(page.getByRole('heading', { level: 1, name: 'Options' })).toBeFocused()

    const session = page.getByRole('textbox', { name: 'Game session time' })
    const spawn = page.getByRole('textbox', { name: 'Enemy spawn time' })
    await expect(session).toHaveValue('120')
    await expect(spawn).toHaveValue('3')

    const limits = [
      { field: session, label: 'game session time', min: '60', max: '180' },
      { field: spawn, label: 'enemy spawn time', min: '1', max: '10' },
    ]
    for (const { field, label, min, max } of limits) {
      for (const [direction, edge] of [
        ['Decrease', min],
        ['Increase', max],
      ] as const) {
        const button = page.getByRole('button', { name: `${direction} ${label}` })
        for (let clicks = 0; clicks < 20 && (await button.isEnabled()); clicks++) await button.click()
        await expect(field).toHaveValue(edge)
        await expect(button).toBeDisabled()
      }
    }

    await session.fill('75')
    await session.blur()
    await expect(page.getByRole('alert')).toHaveText('Use steps of 10 seconds.')
    await expect(session).toHaveAttribute('aria-invalid', 'true')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('status')).not.toContainText('Saved')
    expect(await readStoredOptions(page)).toBeNull()
  })

  test('Save persists across a reload and applies to the next match', async ({ pb, page }) => {
    await pb.open('/options')
    await page.getByRole('textbox', { name: 'Game session time' }).fill('90')
    await page.getByRole('textbox', { name: 'Enemy spawn time' }).fill('5')
    await page.getByRole('button', { name: 'Save', exact: true }).click()
    await expect(page.getByRole('status')).toHaveText('Saved. Applies to your next battle.')
    expect(JSON.parse((await readStoredOptions(page)) ?? 'null')).toEqual({ sessionSeconds: 90, spawnIntervalSec: 5 })

    await page.reload()
    await pb.waitForApp()
    await expect(page.getByRole('textbox', { name: 'Game session time' })).toHaveValue('90')
    await expect(page.getByRole('textbox', { name: 'Enemy spawn time' })).toHaveValue('5')

    await page.getByRole('button', { name: 'Main Menu', exact: true }).click()
    const snapshot = await pb.startMatch()
    expect(snapshot.config).toMatchObject({ sessionSeconds: 90, spawnIntervalSec: 5, configKey: 's90-i5' })
    expect(snapshot.timeLeftSec).toBe(90)
  })

  test('corrupt or invalid stored options fall back to the defaults', async ({ pb, page }) => {
    await pb.open('/')
    for (const stored of ['{broken', JSON.stringify({ sessionSeconds: 75, spawnIntervalSec: 3 })]) {
      await page.evaluate((value) => localStorage.setItem('pb:v1:options', value), stored)
      await page.goto('/options?test=1')
      await pb.waitForApp()
      await expect(page.getByRole('textbox', { name: 'Game session time' })).toHaveValue('120')
      await expect(page.getByRole('textbox', { name: 'Enemy spawn time' })).toHaveValue('3')
    }
  })
})
