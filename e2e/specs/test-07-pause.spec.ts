import type { Page } from '@playwright/test'
import { expect, test } from '../fixtures/pbPage'

const quietMatch = { sessionSeconds: 60, spawnIntervalSec: 10 }

const pauseDialog = (page: Page) => page.getByRole('dialog', { name: 'Paused' })

const setTabHidden = (page: Page, hidden: boolean) =>
  page.evaluate((value) => {
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => value })
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (value ? 'hidden' : 'visible') })
    document.dispatchEvent(new Event('visibilitychange'))
  }, hidden)

const setWindowFocus = (page: Page, focused: boolean) =>
  page.evaluate((value) => {
    if (value) delete (document as { hasFocus?: () => boolean }).hasFocus
    else document.hasFocus = () => false
  }, focused)

test.describe('TEST-07 pause: frozen clock, resume, focus loss', () => {
  test('P pauses and freezes time and cooldowns; P, Esc and the Resume button each resume', async ({ pb, page }) => {
    await pb.open('/')
    await pb.startMatch({ options: quietMatch })
    await pb.step(60)
    const dialog = pauseDialog(page)

    const rounds = [
      { pauseKey: 'KeyP', resume: () => page.keyboard.press('KeyP') },
      { pauseKey: 'Escape', resume: () => page.keyboard.press('Escape') },
      { pauseKey: 'KeyP', resume: () => dialog.getByRole('button', { name: 'Resume', exact: true }).click() },
    ]
    for (const { pauseKey, resume } of rounds) {
      await page.keyboard.down('Space')
      await pb.step(1)
      await page.keyboard.up('Space')
      const before = await pb.snapshot()
      expect(before.player.cooldowns.front).toBeGreaterThan(0)

      await page.keyboard.press(pauseKey)
      expect(await pb.state()).toBe('paused')
      await expect(dialog).toBeVisible()
      await expect(dialog).toContainText('Ready when you are.')

      await pb.advance(5000)
      const paused = await pb.snapshot()
      expect(paused.time).toBe(before.time)
      expect(paused.timeLeftSec).toBe(before.timeLeftSec)
      expect(paused.player.cooldowns).toEqual(before.player.cooldowns)
      expect(paused.spawns).toEqual(before.spawns)

      await resume()
      expect(await pb.state()).toBe('resuming')
      await expect(dialog).toBeHidden()
      await pb.step(1)
      expect(await pb.state()).toBe('running')
      expect((await pb.snapshot()).time).toBe(before.time)
      await pb.step(60)
      expect((await pb.snapshot()).time).toBeCloseTo(before.time + 1, 6)
    }
  })

  test('a key held through a pause or pressed while paused stays inert until pressed again', async ({ pb, page }) => {
    await pb.open('/')
    await pb.startMatch({ options: quietMatch })
    await page.keyboard.down('KeyW')
    await pb.advance(1000)
    expect((await pb.snapshot()).player.speed).toBeGreaterThan(0)

    await page.keyboard.press('KeyP')
    expect(await pb.state()).toBe('paused')
    const atPause = await pb.snapshot()
    await page.keyboard.down('KeyD')
    await page.keyboard.down('KeyQ')
    await pb.advance(1000)
    await pauseDialog(page).getByRole('button', { name: 'Resume', exact: true }).click()
    await pb.step(1)
    expect(await pb.state()).toBe('running')

    await page.keyboard.down('KeyW')
    await pb.advance(2000)
    const coasted = await pb.snapshot()
    expect(coasted.player.speed).toBe(0)
    expect(coasted.player.turnVelocity).toBe(0)
    expect(coasted.player.heading).toBe(atPause.player.heading)
    expect(coasted.player.cooldowns.left).toBe(0)
    expect(coasted.projectiles.filter((shot) => shot.faction === 'player')).toEqual([])

    await page.keyboard.up('KeyW')
    await page.keyboard.down('KeyW')
    await pb.advance(500)
    expect((await pb.snapshot()).player.speed).toBeGreaterThan(0)
    for (const code of ['KeyW', 'KeyD', 'KeyQ']) await page.keyboard.up(code)
  })

  test('window blur, a hidden tab and the HUD Pause button each pause the match', async ({ pb, page }) => {
    await pb.open('/')
    await pb.startMatch({ options: quietMatch })
    const dialog = pauseDialog(page)
    const resume = async () => {
      await dialog.getByRole('button', { name: 'Resume', exact: true }).click()
      await pb.step(1)
    }

    await pb.step(30)
    await page.evaluate(() => window.dispatchEvent(new Event('blur')))
    expect(await pb.state()).toBe('paused')
    await expect(dialog).toBeVisible()
    const blurred = await pb.snapshot()
    await pb.advance(3000)
    expect((await pb.snapshot()).time).toBe(blurred.time)
    await resume()
    expect(await pb.state()).toBe('running')

    await pb.step(30)
    await setTabHidden(page, true)
    expect(await pb.state()).toBe('paused')
    const hidden = await pb.snapshot()
    await pb.advance(3000)
    expect((await pb.snapshot()).time).toBe(hidden.time)
    await resume()
    expect(await pb.state()).toBe('paused')
    await setTabHidden(page, false)
    await resume()
    expect(await pb.state()).toBe('running')

    await pb.step(30)
    await page.getByRole('button', { name: 'Pause', exact: true }).click()
    expect(await pb.state()).toBe('paused')
    await expect(dialog).toBeVisible()
    const clicked = await pb.snapshot()
    await pb.advance(3000)
    expect((await pb.snapshot()).time).toBe(clicked.time)
    await resume()
    expect(await pb.state()).toBe('running')
  })

  test('a battle that finishes loading while the window has no focus starts paused and waits for Resume', async ({
    pb,
    page,
  }) => {
    await pb.open('/')
    await pb.setOptions(quietMatch)
    await pb.setSeed(42)
    await pb.useManualClock()
    await setWindowFocus(page, false)
    await page.getByRole('button', { name: 'Play', exact: true }).click()
    await pb.waitForState('ready', 20_000)
    await pb.step(1)
    expect(await pb.state()).toBe('paused')
    const dialog = pauseDialog(page)
    await expect(dialog).toBeVisible()

    await pb.advance(3000)
    const waiting = await pb.snapshot()
    expect(waiting.time).toBe(0)
    expect(waiting.timeLeftSec).toBe(quietMatch.sessionSeconds)
    expect(waiting.spawns.count).toBe(0)

    const resume = dialog.getByRole('button', { name: 'Resume', exact: true })
    await resume.click()
    await pb.step(1)
    expect(await pb.state()).toBe('paused')

    await setWindowFocus(page, true)
    await resume.click()
    await pb.step(1)
    expect(await pb.state()).toBe('running')
    expect((await pb.snapshot()).time).toBe(0)
    await pb.step(60)
    expect((await pb.snapshot()).time).toBeCloseTo(1, 6)
  })
})
