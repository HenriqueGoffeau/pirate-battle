import { clamp } from '../shared/math'
import type { MapData } from '../shared/mapData'

const cornerTopLeft = 1
const cornerTopRight = 2
const cornerBottomLeft = 4
const cornerBottomRight = 8

export type IslandBounds = { readonly left: number; readonly top: number; readonly right: number; readonly bottom: number }

export type Grid = {
  readonly cols: number
  readonly rows: number
  readonly tile: number
  readonly solid: Uint8Array
  readonly corners: Uint8Array
  readonly cornerRadius: number
  readonly islands: readonly IslandBounds[]
}

function findIslands(cols: number, rows: number, tile: number, solid: Uint8Array): IslandBounds[] {
  const seen = new Uint8Array(cols * rows)
  const islands: IslandBounds[] = []
  for (let start = 0; start < solid.length; start++) {
    if (!solid[start] || seen[start]) continue
    let minCol = cols
    let maxCol = -1
    let minRow = rows
    let maxRow = -1
    const stack = [start]
    seen[start] = 1
    while (stack.length > 0) {
      const index = stack.pop()!
      const col = index % cols
      const row = Math.floor(index / cols)
      minCol = Math.min(minCol, col)
      maxCol = Math.max(maxCol, col)
      minRow = Math.min(minRow, row)
      maxRow = Math.max(maxRow, row)
      const neighbours = [col > 0 ? index - 1 : -1, col < cols - 1 ? index + 1 : -1, index - cols, index + cols]
      for (const next of neighbours) {
        if (next < 0 || next >= solid.length || !solid[next] || seen[next]) continue
        seen[next] = 1
        stack.push(next)
      }
    }
    islands.push({ left: minCol * tile, top: minRow * tile, right: (maxCol + 1) * tile, bottom: (maxRow + 1) * tile })
  }
  return islands
}

export type Push = { x: number; y: number }

export function createGrid(map: MapData, cornerRadius: number): Grid {
  const { cols, rows, tile, solid } = map
  const solidAt = (col: number, row: number) => col >= 0 && row >= 0 && col < cols && row < rows && solid[row * cols + col] === 1
  const corners = new Uint8Array(cols * rows)
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!solidAt(col, row)) continue
      const up = solidAt(col, row - 1)
      const down = solidAt(col, row + 1)
      const left = solidAt(col - 1, row)
      const right = solidAt(col + 1, row)
      let flags = 0
      if (!up && !left) flags |= cornerTopLeft
      if (!up && !right) flags |= cornerTopRight
      if (!down && !left) flags |= cornerBottomLeft
      if (!down && !right) flags |= cornerBottomRight
      corners[row * cols + col] = flags
    }
  }
  return { cols, rows, tile, solid, corners, cornerRadius, islands: findIslands(cols, rows, tile, solid) }
}

export function isSolidCell(grid: Grid, col: number, row: number): boolean {
  return col >= 0 && row >= 0 && col < grid.cols && row < grid.rows && grid.solid[row * grid.cols + col] === 1
}

export function raycast(grid: Grid, x0: number, y0: number, x1: number, y1: number): number | null {
  const size = grid.tile
  let col = Math.floor(x0 / size)
  let row = Math.floor(y0 / size)
  if (isSolidCell(grid, col, row)) return 0
  const dx = x1 - x0
  const dy = y1 - y0
  const stepCol = Math.sign(dx)
  const stepRow = Math.sign(dy)
  const deltaX = stepCol !== 0 ? size / Math.abs(dx) : Infinity
  const deltaY = stepRow !== 0 ? size / Math.abs(dy) : Infinity
  let nextX = stepCol > 0 ? ((col + 1) * size - x0) / dx : stepCol < 0 ? (col * size - x0) / dx : Infinity
  let nextY = stepRow > 0 ? ((row + 1) * size - y0) / dy : stepRow < 0 ? (row * size - y0) / dy : Infinity
  for (;;) {
    let t: number
    if (nextX < nextY) {
      t = nextX
      nextX += deltaX
      col += stepCol
    } else {
      t = nextY
      nextY += deltaY
      row += stepRow
    }
    if (t > 1) return null
    if (isSolidCell(grid, col, row)) return t
  }
}

function roundedCorner(grid: Grid, flags: number, x: number, y: number, left: number, top: number): Push | null {
  const r = grid.cornerRadius
  const right = left + grid.tile
  const bottom = top + grid.tile
  if (flags & cornerTopLeft && x < left + r && y < top + r) return { x: left + r, y: top + r }
  if (flags & cornerTopRight && x > right - r && y < top + r) return { x: right - r, y: top + r }
  if (flags & cornerBottomLeft && x < left + r && y > bottom - r) return { x: left + r, y: bottom - r }
  if (flags & cornerBottomRight && x > right - r && y > bottom - r) return { x: right - r, y: bottom - r }
  return null
}

export function circlePushOut(grid: Grid, cx: number, cy: number, radius: number): Push {
  const size = grid.tile
  const push = { x: 0, y: 0 }
  const firstCol = Math.floor((cx - radius) / size)
  const lastCol = Math.floor((cx + radius) / size)
  const firstRow = Math.floor((cy - radius) / size)
  const lastRow = Math.floor((cy + radius) / size)
  for (let row = firstRow; row <= lastRow; row++) {
    for (let col = firstCol; col <= lastCol; col++) {
      if (!isSolidCell(grid, col, row)) continue
      const x = cx + push.x
      const y = cy + push.y
      const left = col * size
      const top = row * size
      const corner = roundedCorner(grid, grid.corners[row * grid.cols + col], x, y, left, top)
      if (corner) {
        const dx = x - corner.x
        const dy = y - corner.y
        const distance = Math.hypot(dx, dy)
        const overlap = grid.cornerRadius + radius - distance
        if (overlap > 0 && distance > 1e-6) {
          push.x += (dx / distance) * overlap
          push.y += (dy / distance) * overlap
        }
        continue
      }
      const qx = clamp(x, left, left + size)
      const qy = clamp(y, top, top + size)
      const dx = x - qx
      const dy = y - qy
      const distanceSq = dx * dx + dy * dy
      if (distanceSq >= radius * radius) continue
      if (distanceSq > 1e-9) {
        const distance = Math.sqrt(distanceSq)
        push.x += (dx / distance) * (radius - distance)
        push.y += (dy / distance) * (radius - distance)
      } else {
        const toLeft = x - left + radius
        const toRight = left + size - x + radius
        const toTop = y - top + radius
        const toBottom = top + size - y + radius
        const least = Math.min(toLeft, toRight, toTop, toBottom)
        if (least === toLeft) push.x -= toLeft
        else if (least === toRight) push.x += toRight
        else if (least === toTop) push.y -= toTop
        else push.y += toBottom
      }
    }
  }
  return push
}
