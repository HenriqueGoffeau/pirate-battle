import type { EnemyKind } from '../config/gameConfig'
import type { MatchConfig } from '../config/matchConfig'
import { idleIntent } from '../shared/intent'
import type { MapData } from '../shared/mapData'
import { createRng } from '../shared/rng'
import type { EffectKind, Ship, ShipKind, World } from './entities'
import { createGrid } from './grid'

export function createShip(world: Pick<World, 'config'> & { nextId: number }, kind: ShipKind, x: number, y: number, heading: number, arriving: boolean): Ship {
  const spec = kind === 'player' ? world.config.player : world.config.enemies[kind]
  return {
    id: world.nextId++,
    kind,
    faction: kind === 'player' ? 'player' : 'enemy',
    spec,
    color: spec.colorIndex,
    x,
    y,
    heading,
    speed: arriving ? spec.speed * world.config.spawn.arrivalSpeed : 0,
    turnVelocity: 0,
    health: spec.maxHealth,
    stage: 0,
    alive: true,
    arriving,
    killedBy: null,
    hitAt: -Infinity,
    cannons: spec.cannons.map((cannon) => ({ spec: cannon, readyAt: 0 })),
    intent: idleIntent(),
    ai: { blockedFor: 0, commitTurn: 0, commitUntil: 0, orbitSign: 1, orbitBlockedFor: 0, detour: null, aimError: null, track: null },
  }
}

export function createWorld(config: MatchConfig, map: MapData): World {
  const rng = createRng(config.seed)
  const forcedKinds: EnemyKind[] = rng.shuffle(['chaser', 'shooter'])
  const counter = { config, nextId: 1 }
  const player = createShip(counter, 'player', map.playerStart.x, map.playerStart.y, map.playerStart.heading, false)
  return {
    config,
    map,
    grid: createGrid(map, config.islands.cornerRadius),
    width: map.cols * map.tile,
    height: map.rows * map.tile,
    rng,
    aimRng: createRng(Math.imul(config.seed ^ 0x5bd1e995, 0x9e3779b1)),
    playerId: player.id,
    time: 0,
    nextId: counter.nextId,
    score: 0,
    ships: [player],
    projectiles: [],
    effects: [],
    hits: [],
    projectilePool: [],
    effectPool: [],
    nextSpawnAt: config.spawnIntervalSec,
    forcedKinds,
    spawned: 0,
    ended: false,
    endReason: null,
  }
}

export function playerOf(world: World): Ship {
  return world.ships.find((ship) => ship.id === world.playerId)!
}

export function hullCircles(ship: Ship): Array<{ x: number; y: number }> {
  const hx = Math.cos(ship.heading) * ship.spec.hullOffset
  const hy = Math.sin(ship.heading) * ship.spec.hullOffset
  return [
    { x: ship.x + hx, y: ship.y + hy },
    { x: ship.x - hx, y: ship.y - hy },
  ]
}

export function addEffect(world: World, kind: EffectKind, x: number, y: number, rotation: number, color = 0): void {
  const effect = world.effectPool.pop() ?? { kind, x, y, rotation, color, bornAt: 0, duration: 0 }
  effect.kind = kind
  effect.x = x
  effect.y = y
  effect.rotation = rotation
  effect.color = color
  effect.bornAt = world.time
  effect.duration = world.config.effects[kind]
  world.effects.push(effect)
}

export function damageStage(fraction: number, thresholds: readonly number[]): number {
  let stage = 0
  thresholds.forEach((threshold, index) => {
    if (fraction <= threshold) stage = index
  })
  return stage
}
