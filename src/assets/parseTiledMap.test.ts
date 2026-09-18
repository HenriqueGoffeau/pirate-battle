import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { parseTiledMap } from './parseTiledMap'

const map = parseTiledMap('archipelago-1', JSON.parse(readFileSync('public/maps/archipelago-1.json', 'utf8')))
const width = map.cols * map.tile
const height = map.rows * map.tile
const cellAt = (x: number, y: number) => Math.floor(y / map.tile) * map.cols + Math.floor(x / map.tile)
const insideArena = (x: number, y: number) => x > 0 && y > 0 && x < width && y < height

function reachesByWater(from: number, to: number): boolean {
  const seen = new Set([from])
  const queue = [from]
  while (queue.length > 0) {
    const cell = queue.shift()!
    if (cell === to) return true
    const col = cell % map.cols
    const next = [col > 0 ? cell - 1 : -1, col < map.cols - 1 ? cell + 1 : -1, cell - map.cols, cell + map.cols]
    for (const neighbour of next) {
      if (neighbour < 0 || neighbour >= map.solid.length || map.solid[neighbour] || seen.has(neighbour)) continue
      seen.add(neighbour)
      queue.push(neighbour)
    }
  }
  return false
}

describe('archipelago-1 spawn entries', () => {
  it('has ten entries, each allowing at least one enemy kind', () => {
    expect(map.spawnPoints).toHaveLength(10)
    expect(map.spawnPoints.every((point) => point.kinds.length > 0)).toBe(true)
  })

  it.each(map.spawnPoints.map((point, index) => [index, point] as const))(
    'entry %i sits on the arena edge facing inward, with a clear 3x3 water lane that reaches the player start',
    (_, point) => {
      const dx = Math.round(Math.cos(point.heading))
      const dy = Math.round(Math.sin(point.heading))
      expect(Math.abs(dx) + Math.abs(dy)).toBe(1)
      expect([0, width].includes(point.x) || [0, height].includes(point.y)).toBe(true)
      expect(insideArena(point.x + dx * map.tile, point.y + dy * map.tile)).toBe(true)

      for (let step = 0; step < 3; step++) {
        for (const side of [-1, 0, 1]) {
          const x = point.x + dx * (step + 0.5) * map.tile - dy * side * map.tile
          const y = point.y + dy * (step + 0.5) * map.tile + dx * side * map.tile
          expect(insideArena(x, y)).toBe(true)
          expect(map.solid[cellAt(x, y)]).toBe(0)
        }
      }

      const firstCell = cellAt(point.x + dx * map.tile * 0.5, point.y + dy * map.tile * 0.5)
      expect(reachesByWater(firstCell, cellAt(map.playerStart.x, map.playerStart.y))).toBe(true)
    },
  )
})
