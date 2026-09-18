import { Container, RenderTexture, Sprite, TilingSprite, type Renderer, type Spritesheet } from 'pixi.js'
import type { CombatAssets } from '../assets/loader'
import type { MapData } from '../shared/mapData'

export type ArenaStage = { root: Container; destroy(): void }

const shipColors = 6
const playerColor = 1
const seaBleed = 2048

export const shipFrame = (stage: number, color: number) => `ship_${stage * shipColors + color + 1}`

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

export function createArenaStage(renderer: Renderer, assets: CombatAssets, map: MapData): ArenaStage {
  const root = new Container()
  const sea = createSea(assets.tiles, map)
  if (sea) root.addChild(sea)
  const tiles = bakeTiles(renderer, assets.tiles, map)
  root.addChild(new Sprite(tiles))

  const ship = new Sprite(assets.ships.textures[shipFrame(0, playerColor)])
  ship.anchor.set(0.5)
  ship.position.set(map.playerStart.x, map.playerStart.y)
  ship.rotation = map.playerStart.heading - Math.PI / 2
  root.addChild(ship)

  return {
    root,
    destroy() {
      root.destroy({ children: true, texture: false })
      tiles.destroy(true)
    },
  }
}
