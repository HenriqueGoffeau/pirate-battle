import { copyFileSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

type Rect = { x: number; y: number; w: number; h: number }
type Frames = Record<string, { frame: Rect }>

const sourceDir = 'assets'
const targetDir = join('public', 'assets')
const spriteDir = join('src', 'ui', 'sprites')
const uiGroups = ['controls', 'hud', 'menu']
const tileSize = 64
const tileColumns = 16
const tileRows = 6
const shipFrameCount = 102

function pngSize(path: string): { w: number; h: number } {
  const header = readFileSync(path).subarray(0, 24)
  if (header.toString('ascii', 12, 16) !== 'IHDR') {
    throw new Error(`${path} is not a PNG file`)
  }
  return { w: header.readUInt32BE(16), h: header.readUInt32BE(20) }
}

function writeSheet(name: string, image: string, scale: number, frames: Frames): void {
  const size = pngSize(join(targetDir, image))
  const sheet = { frames, meta: { image, size, scale: String(scale) } }
  writeFileSync(join(targetDir, `${name}.json`), `${JSON.stringify(sheet, null, 2)}\n`)
  console.log(`${name}.json: ${Object.keys(frames).length} frames, ${size.w}x${size.h} @${scale}x`)
}

function convertShips(): void {
  const xml = readFileSync(join(sourceDir, 'spritesheet', 'ships_miscellaneous_sheet.xml'), 'utf8')
  const pattern = /<SubTexture name="([^"]+)\.png" x="(\d+)" y="(\d+)" width="(\d+)" height="(\d+)"\/>/g
  const frames: Frames = {}
  for (const [, name, x, y, w, h] of xml.matchAll(pattern)) {
    frames[name] = { frame: { x: Number(x), y: Number(y), w: Number(w), h: Number(h) } }
  }
  if (Object.keys(frames).length !== shipFrameCount) {
    throw new Error(`Expected ${shipFrameCount} ship frames, found ${Object.keys(frames).length}`)
  }
  copyFileSync(join(sourceDir, 'spritesheet', 'ships_miscellaneous_sheet.png'), join(targetDir, 'ships.png'))
  writeSheet('ships', 'ships.png', 1, frames)
}

function convertTiles(file: string, suffix: string, scale: number): void {
  const image = `tiles${suffix}.png`
  copyFileSync(join(sourceDir, 'tilesheet', file), join(targetDir, image))
  const size = pngSize(join(targetDir, image))
  const cell = tileSize * scale
  if (size.w !== tileColumns * cell || size.h !== tileRows * cell) {
    throw new Error(`${file} is ${size.w}x${size.h}, expected a ${tileColumns}x${tileRows} grid of ${cell} px`)
  }
  const frames: Frames = {}
  for (let index = 0; index < tileColumns * tileRows; index++) {
    const col = index % tileColumns
    const row = Math.floor(index / tileColumns)
    frames[`tile_${index}`] = { frame: { x: col * cell, y: row * cell, w: cell, h: cell } }
  }
  writeSheet(`tiles${suffix}`, image, scale, frames)
}

function copyUi(): void {
  for (const file of ['ui_sheet.json', 'ui_sheet.png', 'ui_sheet_retina.json', 'ui_sheet_retina.png']) {
    copyFileSync(join(sourceDir, 'spritesheet', file), join(targetDir, file))
  }
  console.log('ui_sheet: copied 1x and 2x unchanged')
}

function copyUiSprites(): void {
  mkdirSync(spriteDir, { recursive: true })
  let count = 0
  for (const group of uiGroups) {
    const normalDir = join(sourceDir, 'png', 'default', 'ui', group)
    const retinaDir = join(sourceDir, 'png', 'retina', 'ui', group)
    for (const file of readdirSync(normalDir).filter((name) => name.endsWith('.png'))) {
      const normal = pngSize(join(normalDir, file))
      const retina = pngSize(join(retinaDir, file))
      if (retina.w !== normal.w * 2 || retina.h !== normal.h * 2) {
        throw new Error(`${group}/${file}: retina ${retina.w}x${retina.h} is not twice ${normal.w}x${normal.h}`)
      }
      copyFileSync(join(normalDir, file), join(spriteDir, file))
      copyFileSync(join(retinaDir, file), join(spriteDir, file.replace(/\.png$/, '@2x.png')))
      count++
    }
  }
  console.log(`ui sprites: ${count} PNGs copied to ${spriteDir} (1x + @2x)`)
}

mkdirSync(targetDir, { recursive: true })
convertShips()
convertTiles('tiles_sheet.png', '', 1)
convertTiles('tiles_sheet_retina.png', '@2x', 2)
copyUi()
copyUiSprites()
