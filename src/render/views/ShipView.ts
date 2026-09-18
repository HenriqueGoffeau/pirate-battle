import { Sprite, type Container, type Spritesheet } from 'pixi.js'
import type { Ship } from '../../sim/entities'
import { HealthBarView } from './HealthBarView'

const shipColors = 6
const hitTint = 0xff7a7a

export const shipFrame = (stage: number, color: number) => `ship_${stage * shipColors + color + 1}`

export class ShipView {
  private readonly sprite: Sprite
  private readonly bar: HealthBarView
  private readonly ships: Spritesheet
  private stage = -1

  constructor(ship: Ship, ships: Spritesheet, ui: Spritesheet, shipLayer: Container, barLayer: Container) {
    this.ships = ships
    this.sprite = new Sprite()
    this.sprite.anchor.set(0.5)
    shipLayer.addChild(this.sprite)
    this.bar = new HealthBarView(ui, ship.faction === 'player' ? 'enemy_health_fill_green' : 'enemy_health_fill_red', barLayer)
  }

  update(ship: Ship, time: number, hitFlash: number): void {
    if (ship.stage !== this.stage) {
      this.stage = ship.stage
      this.sprite.texture = this.ships.textures[shipFrame(ship.stage, ship.color)]
    }
    this.sprite.position.set(ship.x, ship.y)
    this.sprite.rotation = ship.heading - Math.PI / 2
    this.sprite.tint = time - ship.hitAt < hitFlash ? hitTint : 0xffffff
    this.bar.update(ship)
  }

  destroy(): void {
    this.sprite.destroy()
    this.bar.destroy()
  }
}
