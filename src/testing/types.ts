export type TestMatchState = 'loading' | 'assetError' | 'ready' | 'running' | 'paused' | 'resuming' | 'ended'

export type TestScenarioId =
  | 'success'
  | 'empty'
  | 'manyPages'
  | 'slow'
  | 'jitter'
  | 'outOfOrder'
  | 'timeout'
  | 'networkError'
  | 'http4xx'
  | 'http5xx'
  | 'rankingFails'
  | 'historyFails'
  | 'timeoutAfterSave'
  | 'downThenRecover'

export type TestShip = {
  id: number
  kind: 'player' | 'chaser' | 'shooter'
  x: number
  y: number
  heading: number
  speed: number
  turnVelocity: number
  health: number
  maxHealth: number
  alive: boolean
  arriving: boolean
}

export type TestPlayer = TestShip & { cooldowns: { front: number; left: number; right: number } }

export type TestProjectile = {
  faction: 'player' | 'enemy'
  ownerId: number
  x: number
  y: number
  dirX: number
  dirY: number
  speed: number
  consumed: boolean
}

export type TestSnapshot = {
  state: TestMatchState
  time: number
  score: number
  timeLeftSec: number
  ended: boolean
  endReason: 'timeUp' | 'defeated' | null
  player: TestPlayer
  enemies: TestShip[]
  projectiles: TestProjectile[]
  effects: number
  spawns: { count: number; nextAt: number }
  config: { sessionSeconds: number; spawnIntervalSec: number; configKey: string; seed: number; custom: boolean }
}

export type TestMap = {
  cols: number
  rows: number
  tile: number
  width: number
  height: number
  solid: number[]
  playerStart: { x: number; y: number; heading: number }
  spawnPoints: Array<{ x: number; y: number; heading: number }>
}

export type TestRequest = {
  id: number
  method: string
  path: string
  scenario: string
  status: number | 'network error' | null
  ms: number | null
}

export interface PbTestApi {
  setSeed(seed: number): void
  useManualClock(): void
  advance(ms: number): void
  step(ticks: number): void
  trace(ticks: number): TestSnapshot[]
  getSnapshot(): TestSnapshot | null
  getMap(): TestMap | null
  getMatchState(): TestMatchState | null
  waitForState(state: TestMatchState, timeoutMs?: number): Promise<void>
  setScenario(id: TestScenarioId): void
  resetServer(): void
  getRequestLog(): TestRequest[]
  clearLocal(): void
}
