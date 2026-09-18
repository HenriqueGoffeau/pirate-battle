import { Container, RenderTexture, Sprite, TilingSprite, type Renderer, type Spritesheet } from 'pixi.js'
import type { CombatAssets } from '../assets/loader'
import type { MapData } from '../shared/mapData'
import type { World } from '../sim/entities'
import { EffectsView } from './effects'
import { createFog, type Fog } from './fog'
import { ShipView } from './views/ShipView'

export type StageOptions = { fogWidth: number; fogAlpha: number; fogColor: number }

export type ArenaStage = { root: Container; draw(world: World): void; destroy(): void }

const seaBleed = 2048

function bakeTiles(renderer: Renderer, tiles: Spritesheet, map: MapData): RenderTexture {
  const layer = new Container()
  for (const { tiles: ids } of map.layers) {
    ids.forEach((id, index) => {
      if (id < 0) return
      const sprite = new Sprite(tiles.textures[`tile_${id}`])
      sprite.position.set((index % map.cols) * map.tile, Math.floor(index / map.cols) * map.tile)
      layer.addChild(sprite)
    })
  }
  const texture = RenderTexture.create({
    width: map.cols * map.tile,
    height: map.rows * map.tile,
    resolution: renderer.resolution,
  })
  renderer.render({ container: layer, target: texture })
  layer.destroy({ children: true, texture: false })
  return texture
}

function createSea(tiles: Spritesheet, map: MapData): TilingSprite | null {
  const waterId = map.layers.find((layer) => layer.name === 'water')?.tiles[0]
  if (waterId === undefined || waterId < 0) return null
  const sea = new TilingSprite({
    texture: tiles.textures[`tile_${waterId}`],
    width: map.cols * map.tile + seaBleed * 2,
    height: map.rows * map.tile + seaBleed * 2,
  })
  sea.position.set(-seaBleed, -seaBleed)
  return sea
}

export function createArenaStage(renderer: Renderer, assets: CombatAssets, map: MapData, options: StageOptions): ArenaStage {
  const root = new Container()
  const sea = createSea(assets.tiles, map)
  if (sea) root.addChild(sea)
  const tiles = bakeTiles(renderer, assets.tiles, map)
  const wrecks = new Container()
  const ships = new Container()
  const projectiles = new Container()
  const bursts = new Container()
  const bars = new Container()
  const fog: Fog = createFog({
    width: map.cols * map.tile,
    height: map.rows * map.tile,
    fogWidth: options.fogWidth,
    fogAlpha: options.fogAlpha,
    color: options.fogColor,
    bleed: seaBleed,
  })
  root.addChild(new Sprite(tiles), wrecks, ships, projectiles, bursts, fog.root, bars)

  const shipViews = new Map<number, ShipView>()
  const balls: Sprite[] = []
  const effects = new EffectsView(assets.ships, wrecks, bursts)

  function drawShips(world: World): void {
    const seen = new Set<number>()
    for (const ship of world.ships) {
      if (!ship.alive) continue
      seen.add(ship.id)
      let view = shipViews.get(ship.id)
      if (!view) {
        view = new ShipView(ship, assets.ships, assets.ui, ships, bars)
        shipViews.set(ship.id, view)
      }
      view.update(ship, world.time, world.config.effects.hitFlash)
    }
    for (const [id, view] of shipViews) {
      if (seen.has(id)) continue
      view.destroy()
      shipViews.delete(id)
    }
  }

  function drawProjectiles(world: World): void {
    let count = 0
    for (const projectile of world.projectiles) {
      if (projectile.consumed) continue
      let ball = balls[count]
      if (!ball) {
        ball = new Sprite(assets.ships.textures.cannon_ball)
        ball.anchor.set(0.5)
        projectiles.addChild(ball)
        balls.push(ball)
      }
      ball.visible = true
      ball.position.set(projectile.x, projectile.y)
      count++
    }
    for (let i = count; i < balls.length; i++) balls[i].visible = false
  }

  return {
    root,
    draw(world) {
      drawShips(world)
      drawProjectiles(world)
      effects.draw(world)
    },
    destroy() {
      shipViews.forEach((view) => view.destroy())
      shipViews.clear()
      fog.destroy()
      root.destroy({ children: true, texture: false })
      tiles.destroy(true)
    },
  }
}
