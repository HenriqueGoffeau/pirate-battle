import type { World } from '../entities'
import { playerOf } from '../world'

function compact<T>(items: T[], keep: (item: T) => boolean, pool?: T[]): void {
  let write = 0
  for (const item of items) {
    if (keep(item)) items[write++] = item
    else pool?.push(item)
  }
  items.length = write
}

export function cleanupSystem(world: World): void {
  compact(world.ships, (ship) => ship.alive || ship.id === world.playerId)
  compact(world.projectiles, (projectile) => !projectile.consumed, world.projectilePool)
}

export function effectSystem(world: World): void {
  compact(world.effects, (effect) => world.time - effect.bornAt < effect.duration, world.effectPool)
}

export function endCheck(world: World): void {
  if (world.ended) return
  if (!playerOf(world).alive) {
    world.ended = true
    world.endReason = 'defeated'
  } else if (world.time >= world.config.sessionSeconds) {
    world.ended = true
    world.endReason = 'timeUp'
  }
}
