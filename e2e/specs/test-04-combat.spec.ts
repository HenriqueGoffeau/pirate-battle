import type { Page } from '@playwright/test'
import { GameConfig, type CannonGroup } from '../../src/config/gameConfig'
import type { TestProjectile, TestShip, TestSnapshot } from '../../src/testing/types'
import { expect, test } from '../fixtures/pbPage'

const dt = 1 / 60
const player = GameConfig.player
const front = player.cannons.find((cannon) => cannon.group === 'front')!
const muzzleReach = front.muzzle + front.speed * dt
const quiet = { sessionSeconds: 120, spawnIntervalSec: 10 }

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

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

const specOf = (ship: TestShip) => (ship.kind === 'player' ? player : GameConfig.enemies[ship.kind])

const hullCircles = (ship: TestShip) => {
  const spec = specOf(ship)
  const hx = Math.cos(ship.heading) * spec.hullOffset
  const hy = Math.sin(ship.heading) * spec.hullOffset
  return [
    { x: ship.x + hx, y: ship.y + hy },
    { x: ship.x - hx, y: ship.y - hy },
  ]
}

const groupDirection = (heading: number, group: CannonGroup) => {
  const angle = heading + (player.cannons.find((cannon) => cannon.group === group)!.angle * Math.PI) / 180
  return { x: Math.cos(angle), y: Math.sin(angle) }
}

const ballsOf = (frame: TestSnapshot, group: CannonGroup): TestProjectile[] => {
  const direction = groupDirection(frame.player.heading, group)
  return frame.projectiles.filter(
    (ball) => ball.faction === 'player' && Math.abs(ball.dirX - direction.x) < 1e-9 && Math.abs(ball.dirY - direction.y) < 1e-9,
  )
}

const firedFrontBall = (frame: TestSnapshot) =>
  ballsOf(frame, 'front').some((ball) => Math.abs(Math.hypot(ball.x - frame.player.x, ball.y - frame.player.y) - muzzleReach) < 1e-6)

function createHelm(page: Page) {
  const held = new Set<string>()
  const set = async (code: string, down: boolean) => {
    if (down === held.has(code)) return
    if (down) {
      await page.keyboard.down(code)
      held.add(code)
    } else {
      await page.keyboard.up(code)
      held.delete(code)
    }
  }
  const steer = async (frame: TestSnapshot, bearing: number, tolerance: number): Promise<number | null> => {
    const error = wrapAngle(bearing - frame.player.heading)
    const velocity = frame.player.turnVelocity
    const lead = error - (velocity * Math.abs(velocity)) / (2 * player.turnAccel)
    const right = lead > tolerance / 2
    const left = lead < -tolerance / 2
    await set('KeyD', right)
    await set('KeyA', left)
    if (right || left) return Math.max(1, Math.floor(Math.abs(lead) / (2 * player.turnRate * dt)))
    return velocity === 0 ? null : Math.ceil(Math.abs(velocity) / (player.turnAccel * dt))
  }
  const releaseAll = async () => {
    for (const code of [...held]) await set(code, false)
  }
  return { set, steer, releaseAll }
}

const look = (page: Page, steps: number): Promise<TestSnapshot> =>
  page.evaluate((count) => {
    window.__PB_TEST__!.step(count)
    return window.__PB_TEST__!.getSnapshot()!
  }, steps)

async function turnTo(page: Page, from: TestSnapshot, bearing: number, tolerance = 0.005): Promise<TestSnapshot> {
  const helm = createHelm(page)
  let frame = from
  for (let round = 0; round < 200; round++) {
    const steps = await helm.steer(frame, bearing, tolerance)
    if (steps === null) break
    frame = await look(page, steps)
  }
  await helm.releaseAll()
  expect(Math.abs(wrapAngle(bearing - frame.player.heading))).toBeLessThan(tolerance)
  return frame
}

async function waitFor(page: Page, found: (frame: TestSnapshot) => boolean, limitSec: number, stride = 15): Promise<TestSnapshot> {
  for (let steps = 0; steps < limitSec * 60; steps += stride) {
    const frame = await look(page, stride)
    if (found(frame)) return frame
  }
  throw new Error(`Nothing matched within ${limitSec} s of sim time.`)
}

async function traceUntil(page: Page, found: (frame: TestSnapshot) => boolean, limitSec: number): Promise<TestSnapshot[]> {
  const frames: TestSnapshot[] = []
  while (frames.length < limitSec * 60) {
    const batch = await trace(page, 20)
    const index = batch.findIndex(found)
    if (index >= 0) return [...frames, ...batch.slice(0, index + 1)]
    frames.push(...batch)
  }
  throw new Error(`Nothing matched within ${limitSec} s of sim time.`)
}

test.describe('TEST-04 combat: front and side shots, cooldown, damage, scoring without duplicates', () => {
  test('Space fires one ball along the heading, Q and E fire three parallel balls to each side, holding Space fires at the cooldown rate', async ({
    pb,
    page,
  }) => {
    await pb.open('/')
    const start = await pb.startMatch({ options: quiet })
    const ship = start.player
    const hx = Math.cos(ship.heading)
    const hy = Math.sin(ship.heading)
    expect(start.projectiles).toEqual([])

    await page.keyboard.down('Space')
    const [shot] = await trace(page, 1)
    await page.keyboard.up('Space')
    expect(shot.projectiles).toHaveLength(1)
    const [ball] = shot.projectiles
    expect(ball).toMatchObject({ faction: 'player', ownerId: ship.id, speed: front.speed, consumed: false })
    expect(ball.dirX).toBeCloseTo(hx, 9)
    expect(ball.dirY).toBeCloseTo(hy, 9)
    expect(ball.x).toBeCloseTo(ship.x + hx * muzzleReach, 6)
    expect(ball.y).toBeCloseTo(ship.y + hy * muzzleReach, 6)
    expect(shot.player.cooldowns).toEqual({ front: expect.closeTo(front.cooldown, 9), left: 0, right: 0 })

    const flight = await trace(page, 30)
    const flown = flight[flight.length - 1].projectiles
    expect(flown).toHaveLength(1)
    expect(flown[0].x).toBeCloseTo(ball.x + ball.dirX * front.speed * flight.length * dt, 6)
    expect(flown[0].y).toBeCloseTo(ball.y + ball.dirY * front.speed * flight.length * dt, 6)

    for (const [key, group, turn] of [
      ['KeyQ', 'left', -1],
      ['KeyE', 'right', 1],
    ] as const) {
      await page.keyboard.down(key)
      const [broadside] = await trace(page, 1)
      await page.keyboard.up(key)
      const cannons = player.cannons.filter((cannon) => cannon.group === group)
      const balls = ballsOf(broadside, group)
      expect(cannons).toHaveLength(3)
      expect(balls).toHaveLength(cannons.length)
      for (const sideBall of balls) {
        expect(sideBall.dirX * hx + sideBall.dirY * hy).toBeCloseTo(0, 9)
        expect(Math.sign(hx * sideBall.dirY - hy * sideBall.dirX)).toBe(turn)
      }
      const along = balls.map((sideBall) => (sideBall.x - ship.x) * hx + (sideBall.y - ship.y) * hy).sort((a, b) => a - b)
      const offsets = cannons.map((cannon) => cannon.offset).sort((a, b) => a - b)
      along.forEach((value, index) => expect(value).toBeCloseTo(offsets[index], 6))
      expect(broadside.player.cooldowns[group]).toBeCloseTo(cannons[0].cooldown, 9)
    }

    const reload = await trace(page, Math.ceil(front.cooldown / dt))
    expect(reload[reload.length - 1].player.cooldowns.front).toBe(0)
    const holdSec = 2
    await page.keyboard.down('Space')
    const hold = await trace(page, holdSec * 60)
    await page.keyboard.up('Space')
    expect(hold.filter(firedFrontBall)).toHaveLength(Math.floor(holdSec / front.cooldown) + 1)
    expect(firedFrontBall(hold[0])).toBe(true)
    const released = await trace(page, 60)
    expect(released.some(firedFrontBall)).toBe(false)
  })

  test('an enemy still sailing in through the fog cannot be hit', async ({ pb, page }) => {
    const spec = GameConfig.enemies.shooter
    const isShooter = (ship: TestShip) => ship.kind === 'shooter'
    await pb.open('/')
    await pb.startMatch({ seed: 42 })
    const map = await pb.map()
    const scouted = await waitFor(page, (frame) => frame.enemies.some(isShooter), 15, 5)
    const scout = scouted.enemies.find(isShooter)!
    expect(scout.arriving).toBe(true)
    const entryOf = (ship: TestShip) =>
      map.spawnPoints.reduce((best, point) =>
        Math.hypot(point.x - ship.x, point.y - ship.y) < Math.hypot(best.x - ship.x, best.y - ship.y) ? point : best,
      )
    const entry = entryOf(scout)
    expect(wrapAngle(scout.heading - entry.heading)).toBeCloseTo(0, 9)

    await pb.open('/')
    const start = await pb.startMatch({ seed: 42 })
    expect(Math.hypot(entry.x - start.player.x, entry.y - start.player.y)).toBeLessThan(front.muzzle + front.range)
    const aimed = await turnTo(page, start, Math.atan2(entry.y - start.player.y, entry.x - start.player.x))
    expect(aimed.player).toMatchObject({ x: start.player.x, y: start.player.y })

    await page.keyboard.down('Space')
    const created = await waitFor(page, (frame) => frame.enemies.some((ship) => ship.id === scout.id), 15, 5)
    const frames = await traceUntil(page, (frame) => frame.enemies.some((ship) => ship.id === scout.id && !ship.arriving), 5)
    await page.keyboard.up('Space')
    const intruderAtStart = created.enemies.find((ship) => ship.id === scout.id)!
    expect(intruderAtStart).toMatchObject({ kind: 'shooter', arriving: true })
    expect(entryOf(intruderAtStart)).toEqual(entry)

    const reach = spec.radius + GameConfig.projectile.radius
    let passes = 0
    frames.forEach((frame, index) => {
      const intruder = frame.enemies.find((ship) => ship.id === scout.id && ship.arriving)
      if (!intruder) return
      expect(intruder.health).toBe(spec.maxHealth)
      for (const ball of ballsOf(frame, 'front')) {
        if (!hullCircles(intruder).some((circle) => Math.hypot(ball.x - circle.x, ball.y - circle.y) < reach)) continue
        passes += 1
        const x = ball.x + ball.dirX * ball.speed * dt
        const y = ball.y + ball.dirY * ball.speed * dt
        expect(frames[index + 1].projectiles.some((later) => Math.abs(later.x - x) < 1e-6 && Math.abs(later.y - y) < 1e-6)).toBe(true)
      }
    })
    expect(passes, 'player balls flew through the arriving hull').toBeGreaterThan(0)
    const arrived = frames[frames.length - 1]
    expect(arrived.enemies.find((ship) => ship.id === scout.id)!.health).toBe(spec.maxHealth)
    expect(arrived.score).toBe(0)
  })

  test('shooting a Chaser until it sinks scores exactly one point and removes it', async ({ pb, page }) => {
    const spec = GameConfig.enemies.chaser
    await pb.open('/')
    await pb.startMatch({ seed: 42, options: quiet })
    let frame = await waitFor(page, (next) => next.enemies.some((ship) => ship.kind === 'chaser' && !ship.arriving), 20)
    const chaser = frame.enemies.find((ship) => ship.kind === 'chaser')!
    expect(chaser.health).toBe(spec.maxHealth)

    const helm = createHelm(page)
    const healths = [chaser.health]
    let sunk: TestSnapshot | null = null
    for (let round = 0; round < 600 && !sunk; round++) {
      const target = frame.enemies.find((ship) => ship.id === chaser.id)!
      const distance = Math.hypot(target.x - frame.player.x, target.y - frame.player.y)
      const bearing = Math.atan2(target.y - frame.player.y, target.x - frame.player.x)
      const tolerance = Math.atan2(spec.radius + GameConfig.projectile.radius, distance)
      const inRange = distance < front.muzzle + front.range
      const steering = await helm.steer(frame, bearing, tolerance / 2)
      await helm.set('Space', inRange && Math.abs(wrapAngle(bearing - frame.player.heading)) < tolerance)
      frame = await look(page, Math.min(steering ?? 30, inRange ? 6 : 30))
      const current = frame.enemies.find((ship) => ship.id === chaser.id)
      if (!current) {
        sunk = frame
        continue
      }
      if (current.health !== healths[healths.length - 1]) healths.push(current.health)
      expect(frame.score).toBe(0)
    }
    await helm.releaseAll()

    expect(sunk, 'the Chaser sank').not.toBeNull()
    const hits = Math.ceil(spec.maxHealth / front.damage)
    expect(healths).toEqual(Array.from({ length: hits }, (_, index) => spec.maxHealth - index * front.damage))
    expect(sunk!.score).toBe(1)
    expect(sunk!.player.health).toBe(player.maxHealth)

    for (let check = 0; check < 4; check++) {
      const later = await look(page, 30)
      expect(later.score).toBe(1)
      expect(later.enemies.some((ship) => ship.id === chaser.id)).toBe(false)
    }
  })
})
