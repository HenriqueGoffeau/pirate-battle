import type { MapData, MapPose, SpawnKind, SpawnPoint, TileLayer } from '../shared/mapData'

type TiledProperty = { name: string; value: unknown }
type TiledObject = { type: string; x: number; y: number; rotation: number; properties?: TiledProperty[] }
type TiledLayer =
  | { type: 'tilelayer'; name: string; data: number[] }
  | { type: 'objectgroup'; name: string; objects: TiledObject[] }
type TiledMap = { width: number; height: number; tilewidth: number; tilesets: Array<{ firstgid: number }>; layers: TiledLayer[] }

const renderLayers = ['water', 'shallows', 'land', 'decor']
const spawnKinds: SpawnKind[] = ['chaser', 'shooter']

function toPose(object: TiledObject): MapPose {
  return { x: object.x, y: object.y, heading: (object.rotation * Math.PI) / 180 }
}

function toKinds(object: TiledObject): SpawnKind[] {
  const value = object.properties?.find((property) => property.name === 'kinds')?.value
  const names = typeof value === 'string' ? value.split(',').map((name) => name.trim()) : []
  return spawnKinds.filter((kind) => names.includes(kind))
}

export function parseTiledMap(id: string, json: unknown): MapData {
  const map = json as TiledMap
  const firstGid = map.tilesets[0]?.firstgid ?? 1

  const tileData = (name: string): number[] => {
    const layer = map.layers.find((candidate) => candidate.name === name)
    if (layer?.type !== 'tilelayer') throw new Error(`Map ${id} has no tile layer "${name}"`)
    return layer.data
  }
  const objects = (name: string): TiledObject[] => {
    const layer = map.layers.find((candidate) => candidate.name === name)
    if (layer?.type !== 'objectgroup') throw new Error(`Map ${id} has no object layer "${name}"`)
    return layer.objects
  }

  const layers: TileLayer[] = renderLayers.map((name) => ({
    name,
    tiles: tileData(name).map((gid) => (gid === 0 ? -1 : gid - firstGid)),
  }))
  const player = objects('player').find((object) => object.type === 'player')
  if (!player) throw new Error(`Map ${id} has no player start`)
  const spawnPoints: SpawnPoint[] = objects('spawns')
    .filter((object) => object.type === 'spawn')
    .map((object) => ({ ...toPose(object), kinds: toKinds(object) }))

  return {
    id,
    cols: map.width,
    rows: map.height,
    tile: map.tilewidth,
    layers,
    solid: Uint8Array.from(tileData('land'), (gid) => (gid === 0 ? 0 : 1)),
    playerStart: toPose(player),
    spawnPoints,
  }
}
