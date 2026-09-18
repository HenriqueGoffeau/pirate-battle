import { deepFreeze } from '../shared/math'

export type CannonGroup = 'front' | 'left' | 'right'

export type CannonSpec = {
  readonly id: string
  readonly group: CannonGroup
  readonly angle: number
  readonly offset: number
  readonly muzzle: number
  readonly damage: number
  readonly speed: number
  readonly range: number
  readonly cooldown: number
}

export type ShipSpec = {
  readonly maxHealth: number
  readonly speed: number
  readonly accel: number
  readonly drag: number
  readonly turnRate: number
  readonly turnAccel: number
  readonly radius: number
  readonly hullOffset: number
  readonly colorIndex: number
  readonly cannons: readonly CannonSpec[]
}

export type ChaserSpec = ShipSpec & { readonly impactDamage: number }

export type ShooterSpec = ShipSpec & {
  readonly attackRange: number
  readonly minRange: number
  readonly aimTolerance: number
}

export type EnemyKind = 'chaser' | 'shooter'

export type BalanceConfig = {
  readonly arena: {
    readonly mapId: string
    readonly edgeBand: number
    readonly edgePush: number
    readonly fogWidth: number
    readonly fogAlpha: number
    readonly fogColor: number
  }
  readonly islands: { readonly cornerRadius: number }
  readonly player: ShipSpec
  readonly enemies: { readonly chaser: ChaserSpec; readonly shooter: ShooterSpec }
  readonly ai: {
    readonly separationRadius: number
    readonly feelerLength: number
    readonly stuckAfter: number
    readonly stuckCommit: number
    readonly orbitFlipAfter: number
    readonly detourClearance: number
    readonly detourReach: number
    readonly detourStickiness: number
    readonly aimLead: number
    readonly aimThrust: number
    readonly steerGain: number
    readonly steerDeadZone: number
    readonly weights: { readonly chase: number; readonly separation: number; readonly feeler: number }
  }
  readonly spawn: {
    readonly weights: Readonly<Record<EnemyKind, number>>
    readonly maxAlive: number
    readonly minPlayerDist: Readonly<Record<EnemyKind, number>>
    readonly occupancyRadius: number
    readonly arrivalMargin: number
    readonly arrivalSpeed: number
  }
  readonly projectile: { readonly radius: number; readonly maxLifetime: number }
  readonly effects: {
    readonly muzzle: number
    readonly impact: number
    readonly explosion: number
    readonly wreck: number
    readonly hitFlash: number
  }
  readonly damageStages: readonly number[]
}

const broadside = (side: 'left' | 'right', offset: number, index: number): CannonSpec => ({
  id: `${side[0]}${index}`,
  group: side,
  angle: side === 'left' ? -90 : 90,
  offset,
  muzzle: 30,
  damage: 12,
  speed: 380,
  range: 420,
  cooldown: 1.4,
})

export const GameConfig: BalanceConfig = deepFreeze({
  arena: { mapId: 'archipelago-1', edgeBand: 64, edgePush: 240, fogWidth: 128, fogAlpha: 0.8, fogColor: 0xe4edf2 },
  islands: { cornerRadius: 26 },
  player: {
    maxHealth: 100,
    speed: 120,
    accel: 150,
    drag: 90,
    turnRate: 1.7,
    turnAccel: 5,
    radius: 26,
    hullOffset: 22,
    colorIndex: 1,
    cannons: [
      { id: 'front', group: 'front', angle: 0, offset: 0, muzzle: 56, damage: 20, speed: 420, range: 520, cooldown: 0.6 },
      broadside('left', -22, 1),
      broadside('left', 0, 2),
      broadside('left', 22, 3),
      broadside('right', -22, 1),
      broadside('right', 0, 2),
      broadside('right', 22, 3),
    ],
  },
  enemies: {
    chaser: {
      maxHealth: 40,
      speed: 105,
      accel: 180,
      drag: 120,
      turnRate: 2.4,
      turnAccel: 6,
      radius: 26,
      hullOffset: 22,
      colorIndex: 2,
      impactDamage: 30,
      cannons: [],
    },
    shooter: {
      maxHealth: 60,
      speed: 110,
      accel: 130,
      drag: 90,
      turnRate: 1.6,
      turnAccel: 4.5,
      radius: 26,
      hullOffset: 22,
      colorIndex: 4,
      attackRange: 380,
      minRange: 220,
      aimTolerance: 0.26,
      cannons: [{ id: 'front', group: 'front', angle: 0, offset: 0, muzzle: 56, damage: 10, speed: 360, range: 440, cooldown: 2.2 }],
    },
  },
  ai: {
    separationRadius: 110,
    feelerLength: 48,
    stuckAfter: 1,
    stuckCommit: 1.5,
    orbitFlipAfter: 0.5,
    detourClearance: 48,
    detourReach: 40,
    detourStickiness: 1.15,
    aimLead: 0.4,
    aimThrust: 0.35,
    steerGain: 4,
    steerDeadZone: 0.01,
    weights: { chase: 1, separation: 1, feeler: 1.2 },
  },
  spawn: {
    weights: { shooter: 0.7, chaser: 0.3 },
    maxAlive: 6,
    minPlayerDist: { shooter: 320, chaser: 448 },
    occupancyRadius: 80,
    arrivalMargin: 16,
    arrivalSpeed: 0.5,
  },
  projectile: { radius: 5, maxLifetime: 3 },
  effects: { muzzle: 0.12, impact: 0.3, explosion: 0.7, wreck: 1.8, hitFlash: 0.12 },
  damageStages: [1, 0.66, 0.33, 0],
})
