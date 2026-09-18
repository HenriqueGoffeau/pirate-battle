import { Container, Graphics, Text } from 'pixi.js'
import type { MapData } from '../shared/mapData'

export type DebugOverlayOptions = { edgeBand: number }

const colors = { grid: 0xffffff, solid: 0xff5a4f, edge: 0xffd23f, entry: 0xe5484d, player: 0xffffff }
const arrowLength = 72

const labelStyle = {
  fontFamily: 'system-ui, sans-serif',
  fontSize: 14,
  fontWeight: '700',
  fill: 0xffffff,
  stroke: { color: 0x0b1a26, width: 4 },
} as const

function label(text: string, x: number, y: number, anchorX = 0.5, anchorY = 0.5): Text {
  const item = new Text({ text, style: labelStyle })
  item.anchor.set(anchorX, anchorY)
  item.position.set(x, y)
  return item
}

export function createDebugOverlay(map: MapData, options: DebugOverlayOptions): Container {
  const root = new Container()
  const width = map.cols * map.tile
  const height = map.rows * map.tile
  const shapes = new Graphics()

  for (let col = 1; col < map.cols; col++) shapes.moveTo(col * map.tile, 0).lineTo(col * map.tile, height)
  for (let row = 1; row < map.rows; row++) shapes.moveTo(0, row * map.tile).lineTo(width, row * map.tile)
  shapes.stroke({ width: 1, color: colors.grid, alpha: 0.3 })

  map.solid.forEach((solid, index) => {
    if (solid) shapes.rect((index % map.cols) * map.tile + 2, Math.floor(index / map.cols) * map.tile + 2, map.tile - 4, map.tile - 4)
  })
  shapes.stroke({ width: 2, color: colors.solid, alpha: 0.9 })

  const band = options.edgeBand
  shapes.rect(band, band, width - band * 2, height - band * 2).stroke({ width: 3, color: colors.edge, alpha: 0.9 })

  const start = map.playerStart
  shapes.circle(start.x, start.y, 20).stroke({ width: 4, color: colors.player })
  shapes
    .moveTo(start.x, start.y)
    .lineTo(start.x + Math.cos(start.heading) * 44, start.y + Math.sin(start.heading) * 44)
    .stroke({ width: 4, color: colors.player })

  map.spawnPoints.forEach((point) => {
    const dx = Math.cos(point.heading)
    const dy = Math.sin(point.heading)
    const tipX = point.x + dx * arrowLength
    const tipY = point.y + dy * arrowLength
    shapes.moveTo(point.x, point.y).lineTo(tipX, tipY).stroke({ width: 6, color: colors.entry })
    shapes
      .poly([tipX + dx * 16, tipY + dy * 16, tipX - dy * 12, tipY + dx * 12, tipX + dy * 12, tipY - dx * 12])
      .fill({ color: colors.entry })
  })
  root.addChild(shapes)

  for (let col = 0; col < map.cols; col++) root.addChild(label(String(col), col * map.tile + map.tile / 2, 4, 0.5, 0))
  for (let row = 0; row < map.rows; row++) root.addChild(label(String(row), 4, row * map.tile + map.tile / 2, 0, 0.5))
  map.spawnPoints.forEach((point, index) => {
    const offset = arrowLength + 32
    root.addChild(label(String(index), point.x + Math.cos(point.heading) * offset, point.y + Math.sin(point.heading) * offset))
  })
  root.addChild(label('P', start.x, start.y))

  return root
}
