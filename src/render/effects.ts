import { Sprite, type Container, type Spritesheet } from 'pixi.js'
import type { Effect, World } from '../sim/entities'
import { shipFrame } from './views/ShipView'

const wreckStage = 3

function pooled(pool: Sprite[], index: number, layer: Container): Sprite {
  let sprite = pool[index]
  if (!sprite) {
    sprite = new Sprite()
    sprite.anchor.set(0.5)
    layer.addChild(sprite)
    pool.push(sprite)
  }
  sprite.visible = true
  return sprite
}

export class EffectsView {
  private readonly under: Sprite[] = []
  private readonly over: Sprite[] = []
  private readonly ships: Spritesheet
  private readonly underLayer: Container
  private readonly overLayer: Container

  constructor(ships: Spritesheet, underLayer: Container, overLayer: Container) {
    this.ships = ships
    this.underLayer = underLayer
    this.overLayer = overLayer
  }

  draw(world: World): void {
    let underCount = 0
    let overCount = 0
    for (const effect of world.effects) {
      const t = Math.min(1, Math.max(0, (world.time - effect.bornAt) / effect.duration))
      if (effect.kind === 'wreck') this.drawWreck(pooled(this.under, underCount++, this.underLayer), effect, t)
      else this.drawBurst(pooled(this.over, overCount++, this.overLayer), effect, t)
    }
    for (let i = underCount; i < this.under.length; i++) this.under[i].visible = false
    for (let i = overCount; i < this.over.length; i++) this.over[i].visible = false
  }

  private drawWreck(sprite: Sprite, effect: Effect, t: number): void {
    sprite.texture = this.ships.textures[shipFrame(wreckStage, effect.color)]
    sprite.position.set(effect.x, effect.y)
    sprite.rotation = effect.rotation - Math.PI / 2
    sprite.alpha = 1 - t
    sprite.scale.set(1 - 0.15 * t)
  }

  private drawBurst(sprite: Sprite, effect: Effect, t: number): void {
    sprite.position.set(effect.x, effect.y)
    sprite.rotation = effect.rotation
    if (effect.kind === 'muzzle') {
      sprite.texture = this.ships.textures.explosion_3
      sprite.scale.set(0.35 + 0.25 * t)
      sprite.alpha = 1 - t
    } else if (effect.kind === 'impact') {
      sprite.texture = this.ships.textures.explosion_2
      sprite.scale.set(0.3 + 0.4 * t)
      sprite.alpha = 1 - t
    } else {
      sprite.texture = this.ships.textures.explosion_1
      sprite.scale.set(0.8 + 0.8 * t)
      sprite.alpha = 1 - t * t
    }
  }
}
