import { expect, test } from '../fixtures/pbPage'

test.describe('TEST-14 visual baselines', () => {
  test('menu', async ({ pb, page }) => {
    await pb.open('/')
    await page.evaluate(() => document.fonts.ready)
    await expect(page).toHaveScreenshot('menu.png')
  })

  test('arena after 5 s with seed 42 and no input', async ({ pb, page }) => {
    await pb.open('/')
    await pb.startMatch({ seed: 42 })
    await pb.advance(5000)
    await expect(page).toHaveScreenshot('arena.png')
  })

  test('result after the time runs out', async ({ pb, page }) => {
    await pb.open('/')
    await pb.startMatch({ seed: 42, options: { sessionSeconds: 60, spawnIntervalSec: 10 } })
    await pb.advance(61_000)
    expect((await pb.snapshot()).endReason).toBe('timeUp')
    await expect(page).toHaveURL(/\/result$/)
    await expect(page.getByRole('status').filter({ hasText: 'Saved' })).toBeVisible()
    await expect(page).toHaveScreenshot('result.png')
  })
})
