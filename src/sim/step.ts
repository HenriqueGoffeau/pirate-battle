import type { ShipIntent } from '../shared/intent'
import type { World } from './entities'
import { aiSystem } from './systems/ai'
import { collisionSystem } from './systems/collision'
import { damageSystem } from './systems/damage'
import { cleanupSystem, effectSystem, endCheck } from './systems/lifecycle'
import { movementSystem } from './systems/movement'
import { projectileSystem } from './systems/projectiles'
import { spawnSystem } from './systems/spawn'
import { weaponSystem } from './systems/weapons'
import { playerOf } from './world'

export function step(world: World, dt: number, playerIntent: ShipIntent): void {
  if (world.ended) return
  world.time += dt
  const player = playerOf(world)
  if (player.alive) player.intent = playerIntent
  aiSystem(world, dt)
  movementSystem(world, dt)
  weaponSystem(world)
  projectileSystem(world, dt)
  collisionSystem(world)
  damageSystem(world)
  spawnSystem(world)
  cleanupSystem(world)
  effectSystem(world)
  endCheck(world)
}
