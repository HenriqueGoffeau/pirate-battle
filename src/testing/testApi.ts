import { mockControls } from '../mocks/browser'
import { frameMs, ManualClock } from '../shared/clock'
import { testControl, type InspectedSession } from '../session/testControl'
import type { PbTestApi, TestMap, TestPlayer, TestProjectile, TestShip, TestSnapshot } from './types'

type World = NonNullable<ReturnType<InspectedSession['world']>>
type Ship = World['ships'][number]

declare global {
  interface Window {
    __PB_TEST__?: PbTestApi
  }
}

const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    Object.values(value).forEach(freeze)
    Object.freeze(value)
  }
  return value
}

const shipOf = (ship: Ship): TestShip => ({
  id: ship.id,
  kind: ship.kind,
  x: ship.x,
  y: ship.y,
  heading: ship.heading,
  speed: ship.speed,
  turnVelocity: ship.turnVelocity,
  health: ship.health,
  maxHealth: ship.spec.maxHealth,
  alive: ship.alive,
  arriving: ship.arriving,
})

function playerOf(world: World): TestPlayer {
  const player = world.ships.find((ship) => ship.id === world.playerId)!
  const cooldowns = { front: 0, left: 0, right: 0 }
  for (const cannon of player.cannons) {
    const group = cannon.spec.group
    cooldowns[group] = Math.max(cooldowns[group], Math.max(0, cannon.readyAt - world.time))
  }
  return { ...shipOf(player), cooldowns }
}

function snapshotOf(session: InspectedSession, world: World): TestSnapshot {
  const { config } = world
  const projectiles: TestProjectile[] = world.projectiles.map((shot) => ({
    faction: shot.faction,
    ownerId: shot.sourceId,
    x: shot.x,
    y: shot.y,
    dirX: shot.dirX,
    dirY: shot.dirY,
    speed: shot.speed,
    consumed: shot.consumed,
  }))
  return {
    state: session.state(),
    time: world.time,
    score: world.score,
    timeLeftSec: Math.max(0, Math.ceil(config.sessionSeconds - world.time - 1e-6)),
    ended: world.ended,
    endReason: world.endReason,
    player: playerOf(world),
    enemies: world.ships.filter((ship) => ship.faction === 'enemy').map(shipOf),
    projectiles,
    effects: world.effects.length,
    spawns: { count: world.spawned, nextAt: world.nextSpawnAt },
    config: {
      sessionSeconds: config.sessionSeconds,
      spawnIntervalSec: config.spawnIntervalSec,
      configKey: config.configKey,
      seed: config.seed,
      custom: config.custom,
    },
  }
}

function mapOf(world: World): TestMap {
  const { map } = world
  return {
    cols: map.cols,
    rows: map.rows,
    tile: map.tile,
    width: world.width,
    height: world.height,
    solid: Array.from(map.solid),
    playerStart: { ...map.playerStart },
    spawnPoints: map.spawnPoints.map(({ x, y, heading }) => ({ x, y, heading })),
  }
}

function manualClock(): ManualClock {
  const clock = testControl.current()?.clock
  if (!(clock instanceof ManualClock)) throw new Error('No manual clock: call useManualClock() before the match starts.')
  return clock
}

function waitForState(state: TestSnapshot['state'], timeoutMs = 15_000): Promise<void> {
  return new Promise((resolve, reject) => {
    let unsubscribeStore = () => {}
    let unsubscribeSessions = () => {}
    let timer = 0
    const finish = (error?: Error) => {
      unsubscribeSessions()
      unsubscribeStore()
      window.clearTimeout(timer)
      if (error) reject(error)
      else resolve()
    }
    const check = () => {
      if (testControl.current()?.state() === state) finish()
    }
    const watch = () => {
      unsubscribeStore()
      unsubscribeStore = testControl.current()?.store.subscribe(check) ?? (() => {})
      check()
    }
    timer = window.setTimeout(() => {
      finish(new Error(`Timed out after ${timeoutMs} ms waiting for "${state}" (now "${testControl.current()?.state() ?? 'no match'}").`))
    }, timeoutMs)
    unsubscribeSessions = testControl.subscribe(watch)
    watch()
  })
}

const localPrefix = 'pb:v1:'
const keptKeys = new Set(['pb:v1:scenario'])

export function installTestApi(): void {
  testControl.enable()
  const api: PbTestApi = {
    setSeed: (seed) => testControl.setSeed(seed),
    useManualClock: () => testControl.useManualClock(),
    advance: (ms) => manualClock().advance(ms),
    step: (ticks) => manualClock().advance(ticks * frameMs),
    getSnapshot() {
      const session = testControl.current()
      const world = session?.world()
      return session && world ? freeze(snapshotOf(session, world)) : null
    },
    getMap() {
      const world = testControl.current()?.world()
      return world ? freeze(mapOf(world)) : null
    },
    getMatchState: () => testControl.current()?.state() ?? null,
    waitForState,
    setScenario: (id) => mockControls.setScenario(id),
    resetServer: () => mockControls.resetServer(),
    getRequestLog: () => mockControls.getRequestLog().map((entry) => ({ ...entry })),
    clearLocal() {
      for (const key of Object.keys(localStorage)) {
        if (key.startsWith(localPrefix) && !keptKeys.has(key)) localStorage.removeItem(key)
      }
    },
  }
  window.__PB_TEST__ = Object.freeze(api)
}
