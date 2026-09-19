import { segmentCircle } from '../../shared/math'
import type { Projectile, Ship, World } from '../entities'
import { raycast } from '../grid'
import { addEffect, hullCircles, playerOf } from '../world'

function hitProjectile(world: World, projectile: Projectile): void {
  const radius = world.config.projectile.radius
  let earliest = raycast(world.grid, projectile.prevX, projectile.prevY, projectile.x, projectile.y) ?? Infinity
  let target: Ship | null = null
  for (const ship of world.ships) {
    if (!ship.alive || ship.arriving || ship.faction === projectile.faction) continue
    for (const circle of hullCircles(ship)) {
      const t = segmentCircle(projectile.prevX, projectile.prevY, projectile.x, projectile.y, circle.x, circle.y, ship.spec.radius + radius)
      if (t !== null && t < earliest) {
        earliest = t
        target = ship
      }
    }
  }
  if (earliest === Infinity) return
  projectile.consumed = true
  projectile.x = projectile.prevX + (projectile.x - projectile.prevX) * earliest
  projectile.y = projectile.prevY + (projectile.y - projectile.prevY) * earliest
  if (target) world.hits.push({ targetId: target.id, amount: projectile.damage, source: projectile.faction })
  addEffect(world, 'impact', projectile.x, projectile.y, 0)
}

function expire(world: World, projectile: Projectile): void {
  const margin = world.config.arena.edgeBand
  const outside =
    projectile.x < -margin || projectile.y < -margin || projectile.x > world.width + margin || projectile.y > world.height + margin
  if (outside || projectile.traveled >= projectile.range || world.time - projectile.bornAt >= world.config.projectile.maxLifetime) {
    projectile.consumed = true
  }
}

function deepestContact(first: Ship, second: Ship): { nx: number; ny: number; overlap: number } | null {
  const reach = first.spec.radius + second.spec.radius
  let best: { nx: number; ny: number; overlap: number } | null = null
  for (const a of hullCircles(first)) {
    for (const b of hullCircles(second)) {
      const dx = a.x - b.x
      const dy = a.y - b.y
      const distance = Math.hypot(dx, dy)
      const overlap = reach - distance
      if (overlap <= 0 || (best && overlap <= best.overlap)) continue
      best = distance > 1e-6 ? { nx: dx / distance, ny: dy / distance, overlap } : { nx: 1, ny: 0, overlap }
    }
  }
  return best
}

function pushApart(first: Ship, second: Ship, contact: { nx: number; ny: number; overlap: number }): void {
  const half = contact.overlap / 2
  first.x += contact.nx * half
  first.y += contact.ny * half
  second.x -= contact.nx * half
  second.y -= contact.ny * half
}

const incomingDamage = (world: World, ship: Ship) =>
  world.hits.reduce((total, hit) => (hit.targetId === ship.id ? total + hit.amount : total), 0)

function shipContacts(world: World): void {
  const player = playerOf(world)
  const enemies = world.ships.filter((ship) => ship.faction === 'enemy' && ship.alive && !ship.arriving)
  if (player.alive) {
    for (const enemy of enemies) {
      const contact = deepestContact(player, enemy)
      if (!contact) continue
      if (enemy.kind === 'chaser') {
        if (incomingDamage(world, enemy) >= enemy.health) continue
        world.hits.push({ targetId: player.id, amount: world.config.enemies.chaser.impactDamage, source: 'enemy' })
        world.hits.push({ targetId: enemy.id, amount: Infinity, source: 'self' })
      } else {
        pushApart(player, enemy, contact)
      }
    }
  }
  for (let i = 0; i < enemies.length; i++) {
    for (let j = i + 1; j < enemies.length; j++) {
      const contact = deepestContact(enemies[i], enemies[j])
      if (contact) pushApart(enemies[i], enemies[j], contact)
    }
  }
}

export function collisionSystem(world: World): void {
  for (const projectile of world.projectiles) {
    if (projectile.consumed) continue
    hitProjectile(world, projectile)
    if (!projectile.consumed) expire(world, projectile)
  }
  shipContacts(world)
}
