import type { CannonSpec, EnemyKind, ShipSpec } from '../config/gameConfig'
import type { MatchConfig } from '../config/matchConfig'
import type { ShipIntent } from '../shared/intent'
import type { MapData } from '../shared/mapData'
import type { Rng } from '../shared/rng'
import type { Grid } from './grid'

export type ShipKind = 'player' | EnemyKind
export type Faction = 'player' | 'enemy'
export type KillSource = 'player' | 'enemy' | 'self'
export type EndReason = 'timeUp' | 'defeated'

export type CannonState = { readonly spec: CannonSpec; readyAt: number }

export type AiState = {
  blockedFor: number
  commitTurn: number
  commitUntil: number
  orbitSign: number
  orbitBlockedFor: number
  detour: { x: number; y: number } | null
}

export type Ship = {
  readonly id: number
  readonly kind: ShipKind
  readonly faction: Faction
  readonly spec: ShipSpec
  readonly color: number
  x: number
  y: number
  heading: number
  speed: number
  turnVelocity: number
  health: number
  stage: number
  alive: boolean
  arriving: boolean
  killedBy: KillSource | null
  hitAt: number
  readonly cannons: CannonState[]
  intent: ShipIntent
  readonly ai: AiState
}

export type Projectile = {
  faction: Faction
  sourceId: number
  x: number
  y: number
  prevX: number
  prevY: number
  dirX: number
  dirY: number
  speed: number
  damage: number
  range: number
  traveled: number
  bornAt: number
  consumed: boolean
}

export type EffectKind = 'muzzle' | 'impact' | 'explosion' | 'wreck'

export type Effect = {
  kind: EffectKind
  x: number
  y: number
  rotation: number
  color: number
  bornAt: number
  duration: number
}

export type Hit = { targetId: number; amount: number; source: KillSource }

export type World = {
  readonly config: MatchConfig
  readonly map: MapData
  readonly grid: Grid
  readonly width: number
  readonly height: number
  readonly rng: Rng
  readonly playerId: number
  time: number
  nextId: number
  score: number
  ships: Ship[]
  projectiles: Projectile[]
  effects: Effect[]
  hits: Hit[]
  readonly projectilePool: Projectile[]
  readonly effectPool: Effect[]
  nextSpawnAt: number
  forcedKinds: EnemyKind[]
  spawned: number
  ended: boolean
  endReason: EndReason | null
}
