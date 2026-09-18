import type { World } from '../entities'

export function projectileSystem(world: World, dt: number): void {
  for (const projectile of world.projectiles) {
    if (projectile.consumed) continue
    const distance = projectile.speed * dt
    projectile.prevX = projectile.x
    projectile.prevY = projectile.y
    projectile.x += projectile.dirX * distance
    projectile.y += projectile.dirY * distance
    projectile.traveled += distance
  }
}
