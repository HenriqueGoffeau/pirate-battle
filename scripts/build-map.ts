import { mkdirSync, readFileSync, watch, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Cell = { col: number; row: number }
type Island = { kind: 'sand' | 'grass'; col: number; row: number; cols: number; rows: number }

const mapId = 'archipelago-1'
const cols = 24
const rows = 14
const tile = 64
const minLane = 3

const water = 72
const sandSlice = { tl: 0, t: 1, tr: 2, l: 16, c: 17, r: 18, bl: 32, b: 33, br: 34 }
const shallowSlice = { tl: 9, t: 10, tr: 11, l: 25, c: 26, r: 27, bl: 41, b: 42, br: 43 }
const grassStamp = [5, 6, 7, 8, 21, 22, 23, 24, 37, 38, 39, 40, 53, 54, 55, 56]
const grassSize = 4
const sandSize = 3
const sandDecor = [65, 87]
const grassDecor = [70, 71, 69, 86]

function fail(message: string): never {
  throw new Error(`${mapId}: ${message}`)
}

function readGrid(): string[] {
  const lines = readFileSync(join('scripts', 'maps', `${mapId}.txt`), 'utf8').split(/\r?\n/).filter((line) => line.length > 0)
  if (lines.length !== rows || lines.some((line) => line.length !== cols)) {
    fail(`layout must be ${cols}x${rows} characters`)
  }
  return lines
}

function isLand(ch: string): boolean {
  return 'sSgG'.includes(ch)
}

function findIslands(grid: string[]): Island[] {
  const seen = new Set<number>()
  const islands: Island[] = []
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      if (!isLand(grid[row][col]) || seen.has(row * cols + col)) continue
      const cells: Cell[] = []
      const stack: Cell[] = [{ col, row }]
      seen.add(row * cols + col)
      while (stack.length > 0) {
        const cell = stack.pop()!
        cells.push(cell)
        for (const [dc, dr] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const c = cell.col + dc
          const r = cell.row + dr
          if (c < 0 || r < 0 || c >= cols || r >= rows || seen.has(r * cols + c) || !isLand(grid[r][c])) continue
          seen.add(r * cols + c)
          stack.push({ col: c, row: r })
        }
      }
      const minCol = Math.min(...cells.map((c) => c.col))
      const maxCol = Math.max(...cells.map((c) => c.col))
      const minRow = Math.min(...cells.map((c) => c.row))
      const maxRow = Math.max(...cells.map((c) => c.row))
      const island: Island = { kind: 'sand', col: minCol, row: minRow, cols: maxCol - minCol + 1, rows: maxRow - minRow + 1 }
      if (cells.length !== island.cols * island.rows) fail(`island at ${minCol},${minRow} is not a rectangle`)
      const kinds = new Set(cells.map((c) => grid[c.row][c.col].toLowerCase()))
      if (kinds.size !== 1) fail(`island at ${minCol},${minRow} mixes sand and grass`)
      if (kinds.has('g')) island.kind = 'grass'
      const size = island.kind === 'grass' ? grassSize : sandSize
      if (island.cols !== size || island.rows !== size) {
        fail(`${island.kind} island at ${minCol},${minRow} must be ${size}x${size}: larger islands repeat tiles and show seams`)
      }
      islands.push(island)
    }
  }
  return islands
}

function gap(a: Island, b: Island): number {
  const dx = Math.max(0, a.col - (b.col + b.cols), b.col - (a.col + a.cols))
  const dy = Math.max(0, a.row - (b.row + b.rows), b.row - (a.row + a.rows))
  return Math.hypot(dx, dy)
}

function checkLanes(islands: Island[]): void {
  for (const island of islands) {
    const edge = Math.min(island.col, island.row, cols - island.col - island.cols, rows - island.row - island.rows)
    if (edge < minLane) fail(`island at ${island.col},${island.row} is ${edge} tiles from the arena edge (min ${minLane})`)
  }
  for (let i = 0; i < islands.length; i++) {
    for (let j = i + 1; j < islands.length; j++) {
      const lane = gap(islands[i], islands[j])
      if (lane < minLane) fail(`islands at ${islands[i].col},${islands[i].row} and ${islands[j].col},${islands[j].row} are ${lane.toFixed(2)} tiles apart (min ${minLane})`)
    }
  }
}

function sliceTile(slice: typeof sandSlice, x: number, y: number, w: number, h: number): number {
  const top = y === 0
  const bottom = y === h - 1
  const left = x === 0
  const right = x === w - 1
  if (top) return left ? slice.tl : right ? slice.tr : slice.t
  if (bottom) return left ? slice.bl : right ? slice.br : slice.b
  return left ? slice.l : right ? slice.r : slice.c
}

function buildLayers(grid: string[], islands: Island[]) {
  const layer = (fill: number) => new Array<number>(cols * rows).fill(fill)
  const waterLayer = layer(water + 1)
  const shallows = layer(0)
  const land = layer(0)
  const decor = layer(0)
  let sandDecorUsed = 0
  let grassDecorUsed = 0
  for (const island of islands) {
    for (let y = -1; y <= island.rows; y++) {
      for (let x = -1; x <= island.cols; x++) {
        shallows[(island.row + y) * cols + island.col + x] = sliceTile(shallowSlice, x + 1, y + 1, island.cols + 2, island.rows + 2) + 1
      }
    }
    for (let y = 0; y < island.rows; y++) {
      for (let x = 0; x < island.cols; x++) {
        const index = (island.row + y) * cols + island.col + x
        const ch = grid[island.row + y][island.col + x]
        const interior = x > 0 && y > 0 && x < island.cols - 1 && y < island.rows - 1
        if (ch === ch.toUpperCase() && !interior) fail(`decorated cell at ${island.col + x},${island.row + y} must be an interior cell`)
        if (island.kind === 'grass') {
          land[index] = grassStamp[y * grassSize + x] + 1
          if (ch === 'G') decor[index] = grassDecor[grassDecorUsed++ % grassDecor.length] + 1
        } else {
          land[index] = sliceTile(sandSlice, x, y, island.cols, island.rows) + 1
          if (ch === 'S') decor[index] = sandDecor[sandDecorUsed++ % sandDecor.length] + 1
        }
      }
    }
  }
  return { water: waterLayer, shallows, land, decor }
}

function findMarkers(grid: string[]) {
  let player: Cell | null = null
  const spawns = new Map<number, Cell>()
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < cols; col++) {
      const ch = grid[row][col]
      if (ch === 'P') {
        if (player) fail('more than one player start')
        player = { col, row }
      } else if (/\d/.test(ch)) {
        if (spawns.has(Number(ch))) fail(`spawn ${ch} appears twice`)
        const onBorder = col === 0 || row === 0 || col === cols - 1 || row === rows - 1
        const onCorner = (col === 0 || col === cols - 1) && (row === 0 || row === rows - 1)
        if (!onBorder || onCorner) fail(`spawn ${ch} at ${col},${row} must sit on the border, not on a corner`)
        spawns.set(Number(ch), { col, row })
      } else if (ch !== '.' && !isLand(ch)) {
        fail(`unknown character "${ch}" at ${col},${row}`)
      }
    }
  }
  if (!player) fail('missing player start P')
  if (spawns.size === 0) fail('no spawn points')
  return { player, spawns: [...spawns.entries()].sort(([a], [b]) => a - b).map(([, cell]) => cell) }
}

const center = (cell: Cell) => ({ x: (cell.col + 0.5) * tile, y: (cell.row + 0.5) * tile })

function entryPoint(cell: Cell): { x: number; y: number; rotation: number } {
  const { x, y } = center(cell)
  if (cell.row === 0) return { x, y: 0, rotation: 90 }
  if (cell.row === rows - 1) return { x, y: rows * tile, rotation: 270 }
  if (cell.col === 0) return { x: 0, y, rotation: 0 }
  return { x: cols * tile, y, rotation: 180 }
}

function tileLayer(id: number, name: string, data: number[], visible = true) {
  return { id, name, type: 'tilelayer', x: 0, y: 0, width: cols, height: rows, opacity: 1, visible, data }
}

function build(): void {
  const grid = readGrid()
  const islands = findIslands(grid)
  checkLanes(islands)
  const layers = buildLayers(grid, islands)
  const markers = findMarkers(grid)
  const start = center(markers.player)
  const entries = markers.spawns.map(entryPoint)

  let objectId = 1
  const spawnObjects = entries.map((entry, index) => ({
    id: objectId++,
    name: `spawn-${index}`,
    type: 'spawn',
    ...entry,
    width: 0,
    height: 0,
    point: true,
    visible: true,
    properties: [{ name: 'kinds', type: 'string', value: 'chaser,shooter' }],
  }))
  const playerObject = { id: objectId++, name: 'player', type: 'player', ...start, width: 0, height: 0, rotation: 270, point: true, visible: true }

  const tiled = {
    type: 'map',
    version: '1.10',
    tiledversion: '1.10.2',
    orientation: 'orthogonal',
    renderorder: 'right-down',
    infinite: false,
    width: cols,
    height: rows,
    tilewidth: tile,
    tileheight: tile,
    nextlayerid: 7,
    nextobjectid: objectId,
    tilesets: [
      { firstgid: 1, name: 'tiles', image: '../assets/tiles.png', imagewidth: 1024, imageheight: 384, tilewidth: tile, tileheight: tile, columns: 16, tilecount: 96, margin: 0, spacing: 0 },
    ],
    layers: [
      tileLayer(1, 'water', layers.water),
      tileLayer(2, 'shallows', layers.shallows),
      tileLayer(3, 'land', layers.land),
      tileLayer(4, 'decor', layers.decor),
      { id: 5, name: 'spawns', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown', objects: spawnObjects },
      { id: 6, name: 'player', type: 'objectgroup', x: 0, y: 0, opacity: 1, visible: true, draworder: 'topdown', objects: [playerObject] },
    ],
  }

  mkdirSync(join('public', 'maps'), { recursive: true })
  writeFileSync(join('public', 'maps', `${mapId}.json`), `${JSON.stringify(tiled)}\n`)
  console.log(`${mapId}.json: ${islands.length} islands, ${markers.spawns.length} spawn entries`)
}

if (process.argv.includes('--watch')) {
  const rebuild = () => {
    try {
      build()
    } catch (error) {
      console.error(error instanceof Error ? error.message : error)
    }
  }
  let pending: ReturnType<typeof setTimeout> | undefined
  rebuild()
  watch(join('scripts', 'maps'), () => {
    clearTimeout(pending)
    pending = setTimeout(rebuild, 100)
  })
  console.log('Watching scripts/maps for changes. With npm run dev open, the game page reloads after each rebuild.')
} else {
  build()
}
