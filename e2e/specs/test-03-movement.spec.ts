import type { Page } from '@playwright/test'
import { GameConfig } from '../../src/config/gameConfig'
import type { TestMap, TestShip, TestSnapshot } from '../../src/testing/types'
import { expect, test } from '../fixtures/pbPage'

const dt = 1 / 60
const player = GameConfig.player
const { edgeBand, edgePush } = GameConfig.arena
const quiet = { sessionSeconds: 120, spawnIntervalSec: 10 }

const trace = (page: Page, steps: number): Promise<TestSnapshot[]> =>
  page.evaluate((count) => window.__PB_TEST__!.trace(count), steps)

const wrapAngle = (angle: number) => Math.atan2(Math.sin(angle), Math.cos(angle))

const hullCircles = (ship: TestShip) => {
  const hx = Math.cos(ship.heading) * player.hullOffset
  const hy = Math.sin(ship.heading) * player.hullOffset
  return [
    { x: ship.x + hx, y: ship.y + hy },
    { x: ship.x - hx, y: ship.y - hy },
  ]
}

async function turnTo(page: Page, from: TestSnapshot, bearing: number, tolerance = 0.005): Promise<TestSnapshot[]> {
  const frames: TestSnapshot[] = []
  let frame = from
  let key: 'KeyA' | 'KeyD' | null = null
  for (let round = 0; round < 200; round++) {
    const error = wrapAngle(bearing - frame.player.heading)
    const velocity = frame.player.turnVelocity
    if (Math.abs(error) < tolerance && velocity === 0) break
    const lead = error - (velocity * Math.abs(velocity)) / (2 * player.turnAccel)
    const wanted = lead > tolerance / 2 ? 'KeyD' : lead < -tolerance / 2 ? 'KeyA' : null
    if (wanted !== key) {
      if (key) await page.keyboard.up(key)
      if (wanted) await page.keyboard.down(wanted)
      key = wanted
    }
    const steps = wanted
      ? Math.max(1, Math.floor(Math.abs(lead) / (2 * player.turnRate * dt)))
      : Math.max(1, Math.ceil(Math.abs(velocity) / (player.turnAccel * dt)))
    const batch = await trace(page, steps)
    frames.push(...batch)
    frame = batch[batch.length - 1]
  }
  if (key) await page.keyboard.up(key)
  expect(Math.abs(wrapAngle(bearing - frame.player.heading))).toBeLessThan(tolerance)
  return frames
}

function expectInsideArena(frames: TestSnapshot[], map: TestMap) {
  const r = player.radius
  for (const frame of frames) {
    for (const circle of hullCircles(frame.player)) {
      expect(circle.x - r, `hull inside the left edge at t=${frame.time}`).toBeGreaterThanOrEqual(0)
      expect(circle.y - r, `hull inside the top edge at t=${frame.time}`).toBeGreaterThanOrEqual(0)
      expect(circle.x + r, `hull inside the right edge at t=${frame.time}`).toBeLessThanOrEqual(map.width)
      expect(circle.y + r, `hull inside the bottom edge at t=${frame.time}`).toBeLessThanOrEqual(map.height)
    }
  }
}

function deepestTileOverlap(frames: TestSnapshot[], map: TestMap): number {
  let deepest = 0
  for (const frame of frames) {
    for (const circle of hullCircles(frame.player)) {
      map.solid.forEach((solid, index) => {
        if (!solid) return
        const left = (index % map.cols) * map.tile
        const top = Math.floor(index / map.cols) * map.tile
        const dx = circle.x - Math.min(Math.max(circle.x, left), left + map.tile)
        const dy = circle.y - Math.min(Math.max(circle.y, top), top + map.tile)
        deepest = Math.max(deepest, player.radius - Math.hypot(dx, dy))
      })
    }
  }
  return deepest
}

test.describe('TEST-03 movement: starting a match, thrust, drag, rudder inertia, arena edge, islands', () => {
  test('W accelerates along the heading, releasing it coasts down with drag, D turns with rudder inertia', async ({
    pb,
    page,
  }) => {
    await pb.open('/')
    const start = await pb.startMatch({ options: quiet })
    const map = await pb.map()
    await expect(page).toHaveURL(/\/play/)
    expect(start.state).toBe('running')
    expect(start.player).toMatchObject({ x: map.playerStart.x, y: map.playerStart.y, speed: 0, health: player.maxHealth })
    expect(wrapAngle(start.player.heading - map.playerStart.heading)).toBeCloseTo(0, 9)

    await page.keyboard.down('KeyW')
    const thrust = await trace(page, 60)
    await page.keyboard.up('KeyW')
    thrust.forEach((frame, index) => {
      expect(frame.player.speed).toBeCloseTo(Math.min(player.speed, player.accel * (index + 1) * dt), 6)
    })
    const heading = start.player.heading
    const end = thrust[thrust.length - 1].player
    const dx = end.x - start.player.x
    const dy = end.y - start.player.y
    const thrustSec = thrust.length * dt
    const rampSec = player.speed / player.accel
    const expectedRun = (player.accel * rampSec ** 2) / 2 + player.speed * (thrustSec - rampSec)
    expect(Math.abs(dx * Math.cos(heading) + dy * Math.sin(heading) - expectedRun)).toBeLessThan(player.speed * dt)
    expect(Math.abs(-dx * Math.sin(heading) + dy * Math.cos(heading))).toBeLessThan(1e-6)
    expect(wrapAngle(end.heading - heading)).toBeCloseTo(0, 9)

    const coast = await trace(page, 120)
    coast.forEach((frame, index) => {
      expect(frame.player.speed).toBeCloseTo(Math.max(0, player.speed - player.drag * (index + 1) * dt), 6)
    })
    const rest = coast[coast.length - 1].player
    const coastRun = Math.hypot(rest.x - end.x, rest.y - end.y)
    expect(Math.abs(coastRun - player.speed ** 2 / (2 * player.drag))).toBeLessThan(player.speed * dt)
    const stopped = coast.filter((frame) => frame.player.speed === 0)
    expect(stopped.length).toBeGreaterThan(0)
    expect(stopped.every((frame) => frame.player.x === rest.x && frame.player.y === rest.y)).toBe(true)

    await page.keyboard.down('KeyD')
    const turning = await trace(page, 60)
    await page.keyboard.up('KeyD')
    turning.forEach((frame, index) => {
      expect(frame.player.turnVelocity).toBeCloseTo(Math.min(player.turnRate, player.turnAccel * (index + 1) * dt), 6)
      expect(frame.player).toMatchObject({ x: rest.x, y: rest.y, speed: 0 })
    })
    const turnSec = turning.length * dt
    const expectedTurn = player.turnRate * turnSec - player.turnRate ** 2 / (2 * player.turnAccel)
    const turned = wrapAngle(turning[turning.length - 1].player.heading - rest.heading)
    expect(turned).toBeGreaterThan(0)
    expect(Math.abs(turned - expectedTurn)).toBeLessThan(player.turnRate * dt)

    const easing = await trace(page, 30)
    easing.forEach((frame, index) => {
      expect(frame.player.turnVelocity).toBeCloseTo(Math.max(0, player.turnRate - player.turnAccel * (index + 1) * dt), 6)
    })
    expect(easing[0].player.turnVelocity).toBeGreaterThan(0)
    expect(easing[easing.length - 1].player.turnVelocity).toBe(0)
  })

  test('the arena edge keeps both hull circles inside and the ship slides along the rim', async ({ pb, page }) => {
    await pb.open('/')
    const start = await pb.startMatch({ options: quiet })
    const map = await pb.map()
    const r = player.radius
    const bowGap = (frame: TestSnapshot) => Math.min(...hullCircles(frame.player).map((circle) => circle.y - r))
    const equilibriumGap = edgeBand * (1 - player.speed / edgePush)

    await page.keyboard.down('KeyW')
    const approach = await trace(page, 480)
    expectInsideArena(approach, map)
    const held = approach.slice(-30)
    expect(Math.abs(bowGap(held[0]) - equilibriumGap)).toBeLessThan(player.speed * dt + 0.1)
    expect(Math.abs(held[held.length - 1].player.y - held[0].player.y)).toBeLessThan(0.5)
    expect(held[held.length - 1].player.speed).toBeCloseTo(player.speed, 6)
    expect(held[held.length - 1].player.x).toBeCloseTo(start.player.x, 6)

    const turn = await turnTo(page, held[held.length - 1], -Math.PI / 4)
    expectInsideArena(turn, map)
    const slide = await trace(page, 90)
    await page.keyboard.up('KeyW')
    expectInsideArena(slide, map)
    const first = slide[0].player
    const last = slide[slide.length - 1].player
    expect(last.x - first.x).toBeGreaterThan(player.speed * Math.SQRT1_2 * (slide.length - 1) * dt * 0.95)
    for (const frame of slide) {
      expect(bowGap(frame)).toBeGreaterThanOrEqual(0)
      expect(bowGap(frame)).toBeLessThan(edgeBand)
      expect(frame.player.speed).toBeCloseTo(player.speed, 6)
    }
  })

  test('an island stops a ship driving into it head-on and a glancing ship slides along the coast', async ({
    pb,
    page,
  }) => {
    await pb.open('/')
    await pb.startMatch({ options: quiet })
    const map = await pb.map()

    await page.keyboard.down('KeyW')
    await trace(page, 60)
    await page.keyboard.up('KeyW')
    const coast = await trace(page, 90)
    const rest = coast[coast.length - 1]
    expect(rest.player.speed).toBe(0)

    const row = Math.floor(rest.player.y / map.tile)
    const firstCol = Math.floor(rest.player.x / map.tile) + 1
    const col = map.solid.slice(row * map.cols + firstCol, (row + 1) * map.cols).indexOf(1) + firstCol
    expect(col, 'an island lies east of the stopped ship').toBeGreaterThanOrEqual(firstCol)
    const coastX = col * map.tile

    const facing = await turnTo(page, rest, 0)
    const aimed = facing[facing.length - 1]
    expect(aimed.player).toMatchObject({ x: rest.player.x, y: rest.player.y })

    await page.keyboard.down('KeyW')
    const ram = await trace(page, 150)
    expect(deepestTileOverlap(ram, map)).toBeLessThan(1e-6)
    const bowEdge = (frame: TestSnapshot) => Math.max(...hullCircles(frame.player).map((circle) => circle.x)) + player.radius
    const pressed = ram.slice(-30)
    for (const frame of pressed) {
      expect(Math.abs(bowEdge(frame) - coastX)).toBeLessThan(0.01)
      expect(frame.player.speed).toBeLessThan(player.speed * 0.01)
    }
    expect(Math.abs(pressed[pressed.length - 1].player.x - pressed[0].player.x)).toBeLessThan(0.01)

    const glance = await turnTo(page, ram[ram.length - 1], -(7 * Math.PI) / 18)
    const slide = await trace(page, 120)
    await page.keyboard.up('KeyW')
    expect(deepestTileOverlap([...glance, ...slide], map)).toBeLessThan(1e-6)
    for (const frame of slide) expect(Math.abs(bowEdge(frame) - coastX)).toBeLessThan(0.01)
    const slid = slide[0].player.y - slide[slide.length - 1].player.y
    expect(slid).toBeGreaterThan(map.tile / 4)
  })
})
