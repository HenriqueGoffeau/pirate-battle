import { Application } from 'pixi.js'
import { ensureLoaded, type CombatAssets } from '../assets/loader'
import { tiledMapSource } from '../assets/tiledMap'
import type { MatchConfig } from '../config/matchConfig'
import { InputState } from '../input/inputState'
import { attachKeyboard } from '../input/keyboard'
import { createDebugOverlay } from '../render/debugOverlay'
import { captureFrame } from '../render/snapshot'
import { createArenaStage, type ArenaStage } from '../render/stage'
import { attachViewport, type Viewport } from '../render/viewport'
import { RealClock, type Clock } from '../shared/clock'
import type { CannonGroup } from '../config/gameConfig'
import type { MapData } from '../shared/mapData'
import type { Ship, World } from '../sim/entities'
import { step } from '../sim/step'
import { createWorld, playerOf } from '../sim/world'
import { attachAutoPause, isPlayBlocked } from './lifecycle'
import { startLoop } from './loop'
import { testControl, type InspectedSession } from './testControl'
import type {
  HudSnapshot,
  MatchResult,
  MatchState,
  SessionEventListener,
  SessionEvents,
  SessionStore,
} from './store'

export type GameSessionOptions = { matchConfig: MatchConfig; debugOverlay: boolean; clock?: Clock }

const letterboxColor = '#e4edf2'
const maxResolution = 2

export class GameSession {
  readonly store: SessionStore
  readonly input = new InputState()
  private readonly host: HTMLElement
  private readonly matchConfig: MatchConfig
  private readonly debugOverlay: boolean
  private readonly clock: Clock
  private disposed = false
  private starting = false
  private state: MatchState = 'loading'
  private resultTaken = false
  private endFrame: string | null = null
  private world: World | null = null
  private app: Application | null = null
  private arena: ArenaStage | null = null
  private viewport: Viewport | null = null
  private stopLoop: (() => void) | null = null
  private detachGameplay: (() => void) | null = null
  private readonly listeners = new Map<keyof SessionEvents, Set<(payload: never) => void>>()
  private readonly readyAt: number[] = []
  private readonly firedGroups = new Set<CannonGroup>()
  private readonly inspected: InspectedSession

  constructor(host: HTMLElement, store: SessionStore, options: GameSessionOptions) {
    this.host = host
    this.store = store
    this.matchConfig = options.matchConfig
    this.debugOverlay = options.debugOverlay
    this.clock = options.clock ?? new RealClock()
    this.inspected = { store, clock: this.clock, world: () => this.world, state: () => this.state }
    testControl.attach(this.inspected)
  }

  async start(): Promise<void> {
    if (this.disposed || this.starting || this.app) return
    this.starting = true
    try {
      await this.boot()
    } finally {
      this.starting = false
    }
  }

  retry(): void {
    if (this.state === 'assetError') void this.start()
  }

  pause(): void {
    if (!this.disposed && (this.state === 'running' || this.state === 'resuming')) this.enter('paused')
  }

  resume(): void {
    if (!this.disposed && this.state === 'paused') this.enter('resuming')
  }

  getResult(): MatchResult | null {
    const world = this.world
    if (this.state !== 'ended' || this.resultTaken || !world?.endReason) return null
    this.resultTaken = true
    return {
      score: world.score,
      effectiveSec: Math.floor(world.time),
      endReason: world.endReason,
      matchConfig: this.matchConfig,
      seed: this.matchConfig.seed,
    }
  }

  getEndFrame(): string | null {
    return this.endFrame
  }

  on<K extends keyof SessionEvents>(event: K, listener: SessionEventListener<K>): () => void {
    let set = this.listeners.get(event)
    if (!set) {
      set = new Set()
      this.listeners.set(event, set)
    }
    const entry = listener as (payload: never) => void
    set.add(entry)
    return () => {
      set.delete(entry)
    }
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.stopLoop?.()
    this.setGameplayListeners(false)
    this.input.clear()
    this.listeners.clear()
    this.viewport?.detach()
    this.arena?.destroy()
    this.app?.destroy(true, { children: true, texture: false, textureSource: false })
    this.stopLoop = null
    this.viewport = null
    this.arena = null
    this.app = null
    this.world = null
    this.endFrame = null
    testControl.detach(this.inspected)
  }

  private async boot(): Promise<void> {
    this.enter('loading', { loadProgress: 0 })
    let assets: CombatAssets
    let map: MapData
    const app = new Application()
    try {
      assets = await ensureLoaded((progress) => {
        if (!this.disposed) this.store.publish({ loadProgress: progress })
      })
      if (this.disposed) return
      map = await tiledMapSource.load(this.matchConfig.arena.mapId)
      if (this.disposed) return
      await app.init({
        resolution: Math.min(window.devicePixelRatio, maxResolution),
        autoDensity: true,
        autoStart: false,
        background: letterboxColor,
        eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
      })
    } catch {
      if (!this.disposed) this.enter('assetError')
      return
    }
    if (this.disposed) {
      app.destroy(true, { children: true, texture: false, textureSource: false })
      return
    }

    const { arena: arenaConfig } = this.matchConfig
    this.app = app
    app.canvas.setAttribute('role', 'img')
    app.canvas.setAttribute('aria-label', 'Battle arena')
    this.host.appendChild(app.canvas)
    const world = createWorld(this.matchConfig, map)
    const arena = createArenaStage(app.renderer, assets, map, {
      fogWidth: arenaConfig.fogWidth,
      fogAlpha: arenaConfig.fogAlpha,
      fogColor: arenaConfig.fogColor,
    })
    if (this.debugOverlay) arena.root.addChild(createDebugOverlay(map, { edgeBand: arenaConfig.edgeBand }))
    app.stage.addChild(arena.root)
    this.world = world
    this.arena = arena
    this.viewport = attachViewport(
      this.host,
      app.renderer,
      arena.root,
      { width: world.width, height: world.height },
      () => app.render(),
    )
    this.publishHud(world)
    this.enter('ready', { loadProgress: 1 })
    this.stopLoop = startLoop(this.clock, {
      isRunning: () => this.state === 'running',
      step: (dt) => this.tick(world, dt),
      render: (draw) => this.frame(world, arena, app, draw),
    })
  }

  private tick(world: World, dt: number): void {
    const player = playerOf(world)
    const health = player.health
    const score = world.score
    player.cannons.forEach((cannon, index) => {
      this.readyAt[index] = cannon.readyAt
    })
    step(world, dt, this.input.sample())
    this.emitEdges(world, player, health, score)
    if (!world.ended) return
    this.publishHud(world)
    this.enter('ended', { endReason: world.endReason ?? undefined })
  }

  private emitEdges(world: World, player: Ship, health: number, score: number): void {
    this.firedGroups.clear()
    player.cannons.forEach((cannon, index) => {
      const group = cannon.spec.group
      if (cannon.readyAt === this.readyAt[index] || this.firedGroups.has(group)) return
      this.firedGroups.add(group)
      this.emit('weaponFired', { side: group, cooldownMs: cannon.spec.cooldown * 1000 })
    })
    if (player.health < health) this.emit('playerHit', { amount: health - Math.max(0, player.health) })
    if (world.score > score) this.emit('enemyDestroyed', { score: world.score })
  }

  private emit<K extends keyof SessionEvents>(event: K, payload: SessionEvents[K]): void {
    this.listeners.get(event)?.forEach((listener) => (listener as SessionEventListener<K>)(payload))
  }

  private frame(world: World, arena: ArenaStage, app: Application, draw: boolean): void {
    if (this.state === 'ready' || this.state === 'resuming') this.enter(isPlayBlocked() ? 'paused' : 'running')
    if (draw) {
      arena.draw(world)
      app.render()
      if (this.state === 'ended' && this.endFrame === null) {
        this.endFrame = captureFrame(app.canvas, app.screen.width, app.screen.height)
      }
    }
    this.publishHud(world)
  }

  private enter(state: MatchState, patch: Partial<HudSnapshot> = {}): void {
    this.state = state
    this.setGameplayListeners(state === 'running' || state === 'resuming')
    this.input.clear()
    this.store.publish({ ...patch, matchState: state })
  }

  private setGameplayListeners(active: boolean): void {
    if (active === (this.detachGameplay !== null)) return
    if (!active) {
      this.detachGameplay?.()
      this.detachGameplay = null
      return
    }
    const pause = () => this.pause()
    const detachKeyboard = attachKeyboard(this.input, pause)
    const detachAutoPause = attachAutoPause(pause)
    this.detachGameplay = () => {
      detachKeyboard()
      detachAutoPause()
    }
  }

  private publishHud(world: World): void {
    const player = playerOf(world)
    this.store.publish({
      score: world.score,
      timeLeftSec: Math.max(0, Math.ceil(world.config.sessionSeconds - world.time - 1e-6)),
      health: Math.max(0, Math.ceil(player.health)),
      maxHealth: player.spec.maxHealth,
    })
  }
}
