import type { World } from '../entities'
import { addEffect, damageStage } from '../world'

export function damageSystem(world: World): void {
  for (const hit of world.hits) {
    const ship = world.ships.find((candidate) => candidate.id === hit.targetId)
    if (!ship || !ship.alive) continue
    ship.health = Math.max(0, ship.health - hit.amount)
    ship.hitAt = world.time
    ship.stage = damageStage(ship.health / ship.spec.maxHealth, world.config.damageStages)
    if (ship.health > 0) continue
    ship.alive = false
    ship.killedBy = hit.source
    if (ship.faction === 'enemy' && hit.source === 'player') world.score += 1
    addEffect(world, 'wreck', ship.x, ship.y, ship.heading, ship.color)
    addEffect(world, 'explosion', ship.x, ship.y, 0)
  }
  world.hits.length = 0
}
