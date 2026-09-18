import { approach, clamp, wrapAngle } from '../../shared/math'
import type { Ship, World } from '../entities'
import { circlePushOut } from '../grid'
import { hullCircles } from '../world'

const depth = (gap: number, band: number) => (gap >= band ? 0 : Math.min(1, (band - gap) / band))

function edgeDrift(world: World, ship: Ship): { x: number; y: number } {
  const { edgeBand, edgePush } = world.config.arena
  const r = ship.spec.radius
  const hx = Math.cos(ship.heading)
  const hy = Math.sin(ship.heading)
  let left = 0
  let right = 0
  let top = 0
  let bottom = 0
  for (const circle of hullCircles(ship)) {
    left = Math.max(left, depth(circle.x - r, edgeBand))
    right = Math.max(right, depth(world.width - circle.x - r, edgeBand))
    top = Math.max(top, depth(circle.y - r, edgeBand))
    bottom = Math.max(bottom, depth(world.height - circle.y - r, edgeBand))
  }
  return {
    x: (left * Math.max(0, -hx) - right * Math.max(0, hx)) * edgePush,
    y: (top * Math.max(0, -hy) - bottom * Math.max(0, hy)) * edgePush,
  }
}

function clampToArena(world: World, ship: Ship): void {
  const r = ship.spec.radius
  let dx = 0
  let dy = 0
  for (const circle of hullCircles(ship)) {
    if (circle.x - r < 0) dx = Math.max(dx, r - circle.x)
    if (circle.x + r > world.width) dx = Math.min(dx, world.width - r - circle.x)
    if (circle.y - r < 0) dy = Math.max(dy, r - circle.y)
    if (circle.y + r > world.height) dy = Math.min(dy, world.height - r - circle.y)
  }
  ship.x += dx
  ship.y += dy
}

function resolveIslands(world: World, ship: Ship): void {
  for (let pass = 0; pass < 2; pass++) {
    for (let index = 0; index < 2; index++) {
      const circle = hullCircles(ship)[index]
      const push = circlePushOut(world.grid, circle.x, circle.y, ship.spec.radius)
      ship.x += push.x
      ship.y += push.y
    }
  }
}

export function fullyInside(world: World, ship: Ship): boolean {
  const r = ship.spec.radius
  return hullCircles(ship).every(
    (circle) => circle.x >= r && circle.y >= r && circle.x <= world.width - r && circle.y <= world.height - r,
  )
}

export function movementSystem(world: World, dt: number): void {
  for (const ship of world.ships) {
    if (!ship.alive) continue
    const spec = ship.spec
    const turnTarget = clamp(ship.intent.turn, -1, 1) * spec.turnRate
    ship.turnVelocity = approach(ship.turnVelocity, turnTarget, spec.turnAccel * dt)
    ship.heading = wrapAngle(ship.heading + ship.turnVelocity * dt)
    const target = clamp(ship.intent.thrust, 0, 1) * spec.speed
    ship.speed = approach(ship.speed, target, (target > ship.speed ? spec.accel : spec.drag) * dt)

    const hx = Math.cos(ship.heading)
    const hy = Math.sin(ship.heading)
    const startX = ship.x
    const startY = ship.y
    ship.x += hx * ship.speed * dt
    ship.y += hy * ship.speed * dt

    let driftX = 0
    let driftY = 0
    if (ship.arriving) {
      if (fullyInside(world, ship)) ship.arriving = false
    } else {
      const drift = edgeDrift(world, ship)
      driftX = drift.x * dt
      driftY = drift.y * dt
      ship.x += driftX
      ship.y += driftY
      clampToArena(world, ship)
    }
    resolveIslands(world, ship)

    const forward = (ship.x - startX - driftX) * hx + (ship.y - startY - driftY) * hy
    ship.speed = clamp(forward / dt, 0, ship.speed)
  }
}
