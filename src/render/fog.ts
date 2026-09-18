import { Container, Graphics, Sprite, Texture } from 'pixi.js'

export type FogOptions = {
  width: number
  height: number
  fogWidth: number
  fogAlpha: number
  color: number
  bleed: number
}

export type Fog = { root: Container; destroy(): void }

const cellSize = 8
const outerFade = 64
const margin = outerFade + 32

function hash(ix: number, iy: number): number {
  let h = (Math.imul(ix, 374761393) + Math.imul(iy, 668265263)) | 0
  h = Math.imul(h ^ (h >>> 13), 1274126177)
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296
}

function valueNoise(x: number, y: number): number {
  const ix = Math.floor(x)
  const iy = Math.floor(y)
  const fx = x - ix
  const fy = y - iy
  const sx = fx * fx * (3 - 2 * fx)
  const sy = fy * fy * (3 - 2 * fy)
  const a = hash(ix, iy)
  const b = hash(ix + 1, iy)
  const c = hash(ix, iy + 1)
  const d = hash(ix + 1, iy + 1)
  return a + (b - a) * sx + (c - a) * sy + (a - b - c + d) * sx * sy
}

const clouds = (x: number, y: number) => 0.65 * valueNoise(x / 110, y / 110) + 0.35 * valueNoise(x / 45 + 17.3, y / 45 + 9.1)

function fogAlphaAt(x: number, y: number, options: FogOptions): number {
  const { width, height, fogWidth, fogAlpha } = options
  const puff = clouds(x, y)
  const edgeAlpha = Math.min(1, fogAlpha * (0.45 + 0.9 * puff))
  if (x >= 0 && y >= 0 && x <= width && y <= height) {
    const inside = Math.min(x, y, width - x, height - y)
    const reach = fogWidth * (0.7 + 0.6 * puff)
    if (inside >= reach) return 0
    return edgeAlpha * Math.pow(1 - inside / reach, 1.4)
  }
  const dx = Math.max(-x, 0, x - width)
  const dy = Math.max(-y, 0, y - height)
  return edgeAlpha + (1 - edgeAlpha) * Math.min(1, Math.hypot(dx, dy) / outerFade)
}

function paintFog(options: FogOptions): Texture {
  const columns = Math.ceil((options.width + margin * 2) / cellSize)
  const rows = Math.ceil((options.height + margin * 2) / cellSize)
  const canvas = document.createElement('canvas')
  canvas.width = columns
  canvas.height = rows
  const context = canvas.getContext('2d')
  if (!context) throw new Error('2D canvas unavailable for fog')
  const image = context.createImageData(columns, rows)
  const red = (options.color >> 16) & 0xff
  const green = (options.color >> 8) & 0xff
  const blue = options.color & 0xff
  for (let row = 0; row < rows; row++) {
    for (let col = 0; col < columns; col++) {
      const x = -margin + (col + 0.5) * cellSize
      const y = -margin + (row + 0.5) * cellSize
      const offset = (row * columns + col) * 4
      image.data[offset] = red
      image.data[offset + 1] = green
      image.data[offset + 2] = blue
      image.data[offset + 3] = Math.round(fogAlphaAt(x, y, options) * 255)
    }
  }
  context.putImageData(image, 0, 0)
  return Texture.from(canvas)
}

export function createFog(options: FogOptions): Fog {
  const root = new Container()
  const texture = paintFog(options)
  const haze = new Sprite(texture)
  haze.position.set(-margin, -margin)
  haze.width = Math.ceil((options.width + margin * 2) / cellSize) * cellSize
  haze.height = Math.ceil((options.height + margin * 2) / cellSize) * cellSize

  const outer = new Graphics()
  const { width, height, bleed, color } = options
  const innerRight = -margin + haze.width
  const innerBottom = -margin + haze.height
  outer
    .rect(-bleed, -bleed, width + bleed * 2, bleed - margin)
    .rect(-bleed, innerBottom, width + bleed * 2, height + bleed - innerBottom)
    .rect(-bleed, -margin, bleed - margin, innerBottom + margin)
    .rect(innerRight, -margin, width + bleed - innerRight, innerBottom + margin)
    .fill({ color })

  root.addChild(haze, outer)
  return {
    root,
    destroy() {
      root.destroy({ children: true })
      texture.destroy(true)
    },
  }
}
