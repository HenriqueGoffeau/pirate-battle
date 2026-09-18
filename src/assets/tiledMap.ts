import { Assets } from 'pixi.js'
import type { MapSource } from '../shared/mapData'
import { mapAlias } from './manifest'
import { parseTiledMap } from './parseTiledMap'

export const tiledMapSource: MapSource = {
  async load(id) {
    return parseTiledMap(id, await Assets.load(mapAlias(id)))
  },
}
