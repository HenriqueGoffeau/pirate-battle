import { Container, Rectangle, Sprite, Texture, type Spritesheet } from 'pixi.js'
import type { Ship } from '../../sim/entities'

type FillRect = { x: number; y: number; w: number; h: number }
type UiFrameData = { ui?: { layout?: { fill_rect?: FillRect } } }

const barScale = 0.45
const barLift = 70
const topRoom = 14
const fallbackRect: FillRect = { x: 24, y: 12, w: 112, h: 15 }

export class HealthBarView {
  private readonly container = new Container()
  private readonly fillTexture: Texture
  private readonly fillWidth: number
  private fraction = -1

  constructor(ui: Spritesheet, fillFrame: string, layer: Container) {
    const frame = new Sprite(ui.textures.enemy_health_frame)
    const fillSource = ui.textures[fillFrame]
    const rect = (ui.data.frames[fillFrame] as UiFrameData | undefined)?.ui?.layout?.fill_rect ?? fallbackRect
    this.fillWidth = rect.w
    this.fillTexture = new Texture({
      source: fillSource.source,
      frame: new Rectangle(fillSource.frame.x + rect.x, fillSource.frame.y + rect.y, rect.w, rect.h),
      orig: new Rectangle(0, 0, rect.w, rect.h),
      dynamic: true,
    })
    const fill = new Sprite(this.fillTexture)
    fill.position.set(rect.x, rect.y)
    this.container.addChild(frame, fill)
    this.container.pivot.set(frame.width / 2, frame.height / 2)
    this.container.scale.set(barScale)
    layer.addChild(this.container)
  }

  update(ship: Ship): void {
    this.container.visible = !ship.arriving
    const above = ship.y - barLift
    this.container.position.set(ship.x, above < topRoom ? ship.y + barLift : above)
    const fraction = ship.health / ship.spec.maxHealth
    if (fraction === this.fraction) return
    this.fraction = fraction
    const width = Math.max(0.01, this.fillWidth * fraction)
    this.fillTexture.frame.width = width
    this.fillTexture.orig.width = width
    this.fillTexture.update()
  }

  destroy(): void {
    this.container.destroy({ children: true })
    this.fillTexture.destroy(false)
  }
}
