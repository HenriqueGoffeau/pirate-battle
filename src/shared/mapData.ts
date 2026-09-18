export type SpawnKind = 'chaser' | 'shooter'

export type MapPose = { x: number; y: number; heading: number }

export type SpawnPoint = MapPose & { kinds: SpawnKind[] }

export type TileLayer = { name: string; tiles: number[] }

export type MapData = {
  id: string
  cols: number
  rows: number
  tile: number
  layers: TileLayer[]
  solid: Uint8Array
  playerStart: MapPose
  spawnPoints: SpawnPoint[]
}

export interface MapSource {
  load(id: string): Promise<MapData>
}
