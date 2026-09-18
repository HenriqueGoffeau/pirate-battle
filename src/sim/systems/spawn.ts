import type { EnemyKind } from '../../config/gameConfig'
import type { SpawnPoint } from '../../shared/mapData'
import type { World } from '../entities'
import { createShip, playerOf } from '../world'

function weightedKind(world: World): EnemyKind {
  const { chaser, shooter } = world.config.spawn.weights
  return world.rng.next() < chaser / (chaser + shooter) ? 'chaser' : 'shooter'
}

function candidateEntries(world: World, kind: EnemyKind): SpawnPoint[] {
  const player = playerOf(world)
  const { minPlayerDist, occupancyRadius } = world.config.spawn
  const tile = world.map.tile
  return world.map.spawnPoints.filter((entry) => {
    if (!entry.kinds.includes(kind)) return false
    if (Math.hypot(entry.x - player.x, entry.y - player.y) < minPlayerDist[kind]) return false
    const arrivalX = entry.x + Math.cos(entry.heading) * tile
    const arrivalY = entry.y + Math.sin(entry.heading) * tile
    return world.ships.every((ship) => !ship.alive || Math.hypot(ship.x - arrivalX, ship.y - arrivalY) >= occupancyRadius)
  })
}

export function spawnSystem(world: World): void {
  if (world.time < world.nextSpawnAt) return
  world.nextSpawnAt += world.config.spawnIntervalSec
  const alive = world.ships.filter((ship) => ship.faction === 'enemy' && ship.alive).length
  if (alive >= world.config.spawn.maxAlive) return
  const forced = world.forcedKinds[0]
  const kind = forced ?? weightedKind(world)
  const entries = candidateEntries(world, kind)
  if (entries.length === 0) return
  if (forced) world.forcedKinds.shift()
  const entry = world.rng.pick(entries)
  const spec = world.config.enemies[kind]
  const back = spec.hullOffset + spec.radius + world.config.spawn.arrivalMargin
  const x = entry.x - Math.cos(entry.heading) * back
  const y = entry.y - Math.sin(entry.heading) * back
  world.ships.push(createShip(world, kind, x, y, entry.heading, true))
  world.spawned += 1
}
