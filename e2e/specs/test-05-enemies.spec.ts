import type { Page } from '@playwright/test'
import { GameConfig, type EnemyKind } from '../../src/config/gameConfig'
import type { TestShip, TestSnapshot } from '../../src/testing/types'
import { expect, test } from '../fixtures/pbPage'

const quiet = { sessionSeconds: 120, spawnIntervalSec: 10 }
const { chaser, shooter } = GameConfig.enemies

const look = (page: Page, steps: number): Promise<TestSnapshot> =>
  page.evaluate((count) => {
    window.__PB_TEST__!.step(count)
    return window.__PB_TEST__!.getSnapshot()!
  }, steps)

const trace = (page: Page, steps: number): Promise<TestSnapshot[]> =>
  page.evaluate((count) => {
    const api = window.__PB_TEST__!
    const frames: TestSnapshot[] = []
    for (let index = 0; index < count; index++) {
      api.step(1)
      frames.push(api.getSnapshot()!)
    }
    return frames
  }, steps)

const distanceTo = (frame: TestSnapshot, ship: TestShip) => Math.hypot(ship.x - frame.player.x, ship.y - frame.player.y)

async function waitFor(page: Page, found: (frame: TestSnapshot) => boolean, limitSec: number, stride = 15): Promise<TestSnapshot> {
  for (let steps = 0; steps < limitSec * 60; steps += stride) {
    const frame = await look(page, stride)
    if (found(frame)) return frame
  }
  throw new Error(`Nothing matched within ${limitSec} s of sim time.`)
}

test.describe('TEST-05 enemies: spawn interval, forced first kinds, Chaser and Shooter behaviour', () => {
  test('an enemy spawns at every configured interval and the first two are one of each kind, in a seeded order', async ({
    pb,
    page,
  }) => {
    const runs = [
      { seed: 42, options: { sessionSeconds: 120, spawnIntervalSec: 3 } },
      { seed: 7, options: { sessionSeconds: 60, spawnIntervalSec: 2 } },
    ]
    const orders: EnemyKind[][] = []
    for (const { seed, options } of runs) {
      await pb.open('/')
      const start = await pb.startMatch({ seed, options })
      const interval = options.spawnIntervalSec
      expect(start.spawns).toEqual({ count: 0, nextAt: interval })
      const kinds = new Map<number, EnemyKind>()
      for (let spawned = 0; spawned < 5; spawned++) {
        const frame = await look(page, spawned === 0 ? Math.round(interval * 30) : interval * 60)
        expect(frame.spawns.count, `spawns at t=${frame.time.toFixed(2)} s with seed ${seed}`).toBe(Math.floor(frame.time / interval))
        expect(frame.spawns.count).toBe(spawned)
        expect(frame.spawns.nextAt).toBe((spawned + 1) * interval)
        expect(frame.enemies.length).toBeLessThan(GameConfig.spawn.maxAlive)
        for (const ship of frame.enemies) if (!kinds.has(ship.id) && ship.kind !== 'player') kinds.set(ship.id, ship.kind)
      }
      const order = [...kinds.entries()].sort(([a], [b]) => a - b).map(([, kind]) => kind)
      expect(order.slice(0, 2).sort()).toEqual(['chaser', 'shooter'])
      orders.push(order.slice(0, 2))
    }
    expect(orders[0]).not.toEqual(orders[1])
  })

  test('a Chaser closes in on an idle player and explodes on contact for its impact damage without scoring', async ({
    pb,
    page,
  }) => {
    await pb.open('/')
    await pb.startMatch({ seed: 42, options: quiet })
    let frame = await waitFor(page, (next) => next.enemies.some((ship) => ship.kind === 'chaser' && !ship.arriving), 20)
    const rammer = frame.enemies.find((ship) => ship.kind === 'chaser')!
    const distances = [distanceTo(frame, rammer)]
    const reachOnContact = 2 * (chaser.hullOffset + chaser.radius)

    for (let round = 0; round < 120 && distances[distances.length - 1] > reachOnContact + chaser.speed / 4; round++) {
      frame = await look(page, 15)
      const current = frame.enemies.find((ship) => ship.id === rammer.id)
      expect(current, 'the Chaser is still afloat before contact').toBeDefined()
      expect(current!.speed).toBeLessThanOrEqual(chaser.speed + 1e-9)
      distances.push(distanceTo(frame, current!))
    }
    expect(distances[distances.length - 1]).toBeLessThan(distances[0] / 2)
    expect(frame.player.health).toBe(GameConfig.player.maxHealth)

    let before = frame
    let impact: TestSnapshot | null = null
    for (let round = 0; round < 20 && !impact; round++) {
      for (const next of await trace(page, 15)) {
        if (!next.enemies.some((ship) => ship.id === rammer.id)) {
          impact = next
          break
        }
        expect(next.player.health).toBe(before.player.health)
        before = next
      }
    }
    expect(impact, 'the Chaser rammed the player').not.toBeNull()
    expect(before.player.health - impact!.player.health).toBe(chaser.impactDamage)
    expect(impact!.score).toBe(before.score)
    const last = before.enemies.find((ship) => ship.id === rammer.id)!
    expect(distanceTo(before, last)).toBeLessThan(reachOnContact)
  })

  test('a Shooter settles into a standoff inside its attack range and fires at the player', async ({ pb, page }) => {
    await pb.open('/')
    await pb.startMatch({ seed: 7, options: quiet })
    const map = await pb.map()
    const arrival = await waitFor(page, (next) => next.enemies.some((ship) => ship.kind === 'shooter' && !ship.arriving), 20)
    const gunner = arrival.enemies.find((ship) => ship.kind === 'shooter')!
    await waitFor(page, (next) => {
      const ship = next.enemies.find((candidate) => candidate.id === gunner.id)
      return !!ship && distanceTo(next, ship) <= shooter.attackRange
    }, 20)

    const distances: number[] = []
    let shots = 0
    for (let sample = 0; sample < 32; sample++) {
      const frame = await look(page, 15)
      const current = frame.enemies.find((ship) => ship.id === gunner.id)
      expect(current, 'the Shooter stays afloat').toBeDefined()
      distances.push(distanceTo(frame, current!))
      shots += frame.projectiles.filter((ball) => ball.faction === 'enemy' && ball.ownerId === gunner.id).length
    }
    expect(Math.max(...distances)).toBeLessThanOrEqual(shooter.attackRange)
    expect(Math.min(...distances)).toBeGreaterThan(shooter.minRange - map.tile)
    const mean = distances.reduce((sum, value) => sum + value, 0) / distances.length
    expect(mean).toBeGreaterThanOrEqual(shooter.minRange)
    expect(mean).toBeLessThanOrEqual(shooter.attackRange)
    expect(shots, 'Shooter balls in flight').toBeGreaterThan(0)
  })
})
