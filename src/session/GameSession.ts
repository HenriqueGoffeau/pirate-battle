import { Application } from 'pixi.js'
import { ensureLoaded, type CombatAssets } from '../assets/loader'
import { tiledMapSource } from '../assets/tiledMap'
import { GameConfig } from '../config/gameConfig'
import { createDebugOverlay } from '../render/debugOverlay'
import { createArenaStage, type ArenaStage } from '../render/stage'
import { attachViewport, type Viewport } from '../render/viewport'
import type { MapData } from '../shared/mapData'
import type { SessionStore } from './store'

export type GameSessionOptions = { mapId: string; debugOverlay: boolean }

const letterboxColor = '#243447'
const maxResolution = 2

export class GameSession {
  readonly store: SessionStore
  private readonly host: HTMLElement
  private readonly mapId: string
  private readonly debugOverlay: boolean
  private disposed = false
  private starting = false
  private app: Application | null = null
  private arena: ArenaStage | null = null
  private viewport: Viewport | null = null

  constructor(host: HTMLElement, store: SessionStore, options: GameSessionOptions) {
    this.host = host
    this.store = store
    this.mapId = options.mapId
    this.debugOverlay = options.debugOverlay
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
    if (this.store.getSnapshot().matchState === 'assetError') void this.start()
  }

  dispose(): void {
    if (this.disposed) return
    this.disposed = true
    this.viewport?.detach()
    this.arena?.destroy()
    this.app?.destroy(true, { children: true, texture: false, textureSource: false })
    this.viewport = null
    this.arena = null
    this.app = null
  }

  private async boot(): Promise<void> {
    this.store.publish({ matchState: 'loading', loadProgress: 0 })
    let assets: CombatAssets
    let map: MapData
    const app = new Application()
    try {
      assets = await ensureLoaded((progress) => {
        if (!this.disposed) this.store.publish({ loadProgress: progress })
      })
      if (this.disposed) return
      map = await tiledMapSource.load(this.mapId)
      if (this.disposed) return
      await app.init({
        resolution: Math.min(window.devicePixelRatio, maxResolution),
        autoDensity: true,
        autoStart: false,
        background: letterboxColor,
        eventFeatures: { move: false, globalMove: false, click: false, wheel: false },
      })
    } catch {
      if (!this.disposed) this.store.publish({ matchState: 'assetError' })
      return
    }
    if (this.disposed) {
      app.destroy(true, { children: true, texture: false, textureSource: false })
      return
    }

    this.app = app
    app.canvas.setAttribute('role', 'img')
    app.canvas.setAttribute('aria-label', 'Battle arena')
    this.host.appendChild(app.canvas)
    this.arena = createArenaStage(app.renderer, assets, map)
    if (this.debugOverlay) this.arena.root.addChild(createDebugOverlay(map, { edgeBand: GameConfig.arena.edgeBand }))
    app.stage.addChild(this.arena.root)
    this.viewport = attachViewport(
      this.host,
      app.renderer,
      this.arena.root,
      { width: map.cols * map.tile, height: map.rows * map.tile },
      () => app.render(),
    )
    this.store.publish({ matchState: 'ready', loadProgress: 1 })
  }
}
