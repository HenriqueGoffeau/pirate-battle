import { clamp, degToRad, wrapAngle } from '../../shared/math'
import type { Ship, World } from '../entities'
import { raycast, type IslandBounds } from '../grid'
import { playerOf } from '../world'

type Vec = { x: number; y: number }
type Feeler = { push: Vec; blocked: boolean; side: number }

function steer(world: World, ship: Ship, dir: Vec, fullThrust: boolean): void {
  if (Math.abs(dir.x) < 1e-9 && Math.abs(dir.y) < 1e-9) {
    ship.intent.turn = 0
    ship.intent.thrust = 0
    return
  }
  const { turnRate, turnAccel } = ship.spec
  const { steerGain, steerDeadZone } = world.config.ai
  const error = wrapAngle(Math.atan2(dir.y, dir.x) - ship.heading)
  const size = Math.abs(error)
  const rate = Math.min(turnRate, Math.sqrt(2 * turnAccel * size), size * steerGain)
  ship.intent.turn = size < steerDeadZone ? 0 : clamp((Math.sign(error) * rate) / turnRate, -1, 1)
  ship.intent.thrust = fullThrust || size < Math.PI / 2 ? 1 : 0.3
}

function toward(from: Vec, to: Vec): Vec {
  const dx = to.x - from.x
  const dy = to.y - from.y
  const length = Math.hypot(dx, dy)
  return length > 1e-6 ? { x: dx / length, y: dy / length } : { x: 0, y: 0 }
}

function separation(world: World, ship: Ship): Vec {
  const radius = world.config.ai.separationRadius
  const result = { x: 0, y: 0 }
  for (const other of world.ships) {
    if (other === ship || other.faction !== 'enemy' || !other.alive || other.arriving) continue
    const dx = ship.x - other.x
    const dy = ship.y - other.y
    const distance = Math.hypot(dx, dy)
    if (distance < 1e-6 || distance >= radius) continue
    const weight = 1 - distance / radius
    result.x += (dx / distance) * weight
    result.y += (dy / distance) * weight
  }
  return result
}

function feeler(world: World, ship: Ship): Feeler {
  const reach = ship.spec.hullOffset + ship.spec.radius + world.config.ai.feelerLength
  const cast = (angle: number) =>
    raycast(world.grid, ship.x, ship.y, ship.x + Math.cos(angle) * reach, ship.y + Math.sin(angle) * reach)
  const ahead = cast(ship.heading)
  if (ahead === null) return { push: { x: 0, y: 0 }, blocked: false, side: 0 }
  const leftRoom = cast(ship.heading - 0.6) ?? 1
  const rightRoom = cast(ship.heading + 0.6) ?? 1
  const side = leftRoom > rightRoom ? -1 : 1
  const angle = ship.heading + (side * Math.PI) / 2
  const strength = 1 - ahead
  return { push: { x: Math.cos(angle) * strength, y: Math.sin(angle) * strength }, blocked: true, side }
}

function detourPoints(island: IslandBounds, clearance: number): Vec[] {
  return [
    { x: island.left - clearance, y: island.top - clearance },
    { x: island.right + clearance, y: island.top - clearance },
    { x: island.left - clearance, y: island.bottom + clearance },
    { x: island.right + clearance, y: island.bottom + clearance },
  ]
}

function chaseTarget(world: World, ship: Ship, player: Ship, clearSight: boolean): Vec {
  if (clearSight) {
    ship.ai.detour = null
    return player
  }
  const { detourClearance, detourReach, detourStickiness } = world.config.ai
  const visible = (point: Vec) => raycast(world.grid, ship.x, ship.y, point.x, point.y) === null
  const cost = (point: Vec) => Math.hypot(point.x - ship.x, point.y - ship.y) + Math.hypot(player.x - point.x, player.y - point.y)
  const reached = (point: Vec) => Math.hypot(point.x - ship.x, point.y - ship.y) < detourReach
  let best: Vec | null = null
  let bestCost = Infinity
  for (const island of world.grid.islands) {
    for (const point of detourPoints(island, detourClearance)) {
      if (reached(point) || !visible(point)) continue
      const pointCost = cost(point)
      if (pointCost < bestCost) {
        best = point
        bestCost = pointCost
      }
    }
  }
  const current = ship.ai.detour
  if (current && !reached(current) && visible(current) && cost(current) <= bestCost * detourStickiness) return current
  ship.ai.detour = best
  return best ?? player
}

function aimAndFire(world: World, ship: Ship, player: Ship, distance: number, clearSight: boolean): void {
  if (!clearSight) return
  const angleToPlayer = Math.atan2(player.y - ship.y, player.x - ship.x)
  const tolerance = world.config.enemies.shooter.aimTolerance
  for (const cannon of ship.cannons) {
    const direction = ship.heading + degToRad(cannon.spec.angle)
    if (Math.abs(wrapAngle(direction - angleToPlayer)) < tolerance && distance <= cannon.spec.range) {
      ship.intent.fire[cannon.spec.group] = true
    }
  }
}

function applyStuckRule(world: World, ship: Ship, sense: Feeler, dt: number): void {
  const ai = ship.ai
  if (world.time < ai.commitUntil) {
    ship.intent.turn = ai.commitTurn
    ship.intent.thrust = 0.6
    return
  }
  ai.blockedFor = sense.blocked ? ai.blockedFor + dt : 0
  if (ai.blockedFor > world.config.ai.stuckAfter) {
    ai.commitTurn = sense.side || 1
    ai.commitUntil = world.time + world.config.ai.stuckCommit
    ai.blockedFor = 0
  }
}

function orbitOrAim(world: World, ship: Ship, toPlayer: Vec, sense: Feeler, clearSight: boolean, dt: number): void {
  const ai = ship.ai
  const { aimLead, aimThrust, orbitFlipAfter, weights } = world.config.ai
  const loaded = ship.cannons.some((cannon) => world.time >= cannon.readyAt - aimLead)
  if (loaded && clearSight) {
    steer(world, ship, toPlayer, false)
    ship.intent.thrust = aimThrust
    return
  }
  ai.orbitBlockedFor = sense.blocked ? ai.orbitBlockedFor + dt : 0
  if (ai.orbitBlockedFor > orbitFlipAfter) {
    ai.orbitSign *= -1
    ai.orbitBlockedFor = 0
  }
  const orbit = { x: -toPlayer.y * ai.orbitSign, y: toPlayer.x * ai.orbitSign }
  steer(world, ship, { x: orbit.x + sense.push.x * weights.feeler, y: orbit.y + sense.push.y * weights.feeler }, false)
}

export function aiSystem(world: World, dt: number): void {
  const player = playerOf(world)
  const weights = world.config.ai.weights
  const shooterSpec = world.config.enemies.shooter
  for (const ship of world.ships) {
    if (ship.faction !== 'enemy' || !ship.alive) continue
    const fire = ship.intent.fire
    fire.front = fire.left = fire.right = false
    if (ship.arriving) {
      ship.intent.thrust = 1
      ship.intent.turn = 0
      continue
    }
    if (!player.alive) {
      ship.intent.thrust = 0
      ship.intent.turn = 0
      continue
    }
    const distance = Math.hypot(player.x - ship.x, player.y - ship.y)
    const toPlayer = toward(ship, player)
    const clearSight = raycast(world.grid, ship.x, ship.y, player.x, player.y) === null
    const toTarget = toward(ship, chaseTarget(world, ship, player, clearSight))
    const apart = separation(world, ship)
    const sense = feeler(world, ship)
    const chase = {
      x: toTarget.x * weights.chase + apart.x * weights.separation + sense.push.x * weights.feeler,
      y: toTarget.y * weights.chase + apart.y * weights.separation + sense.push.y * weights.feeler,
    }
    if (ship.kind === 'chaser') {
      steer(world, ship, chase, true)
    } else if (distance > shooterSpec.attackRange || !clearSight) {
      steer(world, ship, chase, false)
    } else if (distance < shooterSpec.minRange) {
      steer(world, ship, { x: -toPlayer.x + apart.x + sense.push.x, y: -toPlayer.y + apart.y + sense.push.y }, false)
    } else {
      orbitOrAim(world, ship, toPlayer, sense, clearSight, dt)
    }
    applyStuckRule(world, ship, sense, dt)
    if (ship.kind === 'shooter') aimAndFire(world, ship, player, distance, clearSight)
  }
}
