import type { CannonSpec } from '../../config/gameConfig'
import { degToRad } from '../../shared/math'
import type { Projectile, Ship, World } from '../entities'
import { addEffect } from '../world'

function fire(world: World, ship: Ship, cannon: CannonSpec): void {
  const hx = Math.cos(ship.heading)
  const hy = Math.sin(ship.heading)
  const angle = ship.heading + degToRad(cannon.angle)
  const dirX = Math.cos(angle)
  const dirY = Math.sin(angle)
  const x = ship.x + hx * cannon.offset + dirX * cannon.muzzle
  const y = ship.y + hy * cannon.offset + dirY * cannon.muzzle
  const fields: Projectile = {
    faction: ship.faction,
    sourceId: ship.id,
    x,
    y,
    prevX: x,
    prevY: y,
    dirX,
    dirY,
    speed: cannon.speed,
    damage: cannon.damage,
    range: cannon.range,
    traveled: 0,
    bornAt: world.time,
    consumed: false,
  }
  const pooled = world.projectilePool.pop()
  world.projectiles.push(pooled ? Object.assign(pooled, fields) : fields)
  addEffect(world, 'muzzle', x, y, angle)
}

export function weaponSystem(world: World): void {
  for (const ship of world.ships) {
    if (!ship.alive || ship.arriving) continue
    for (const cannon of ship.cannons) {
      if (!ship.intent.fire[cannon.spec.group] || world.time < cannon.readyAt) continue
      cannon.readyAt = world.time + cannon.spec.cooldown
      fire(world, ship, cannon.spec)
    }
  }
}
