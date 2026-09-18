import { idleIntent, type ShipIntent } from '../shared/intent'
import { actionFor, type Action } from './bindings'

export class InputState {
  private readonly keys = new Set<string>()
  private readonly buttons = new Set<Action>()

  keyDown(code: string): void {
    this.keys.add(code)
  }

  keyUp(code: string): void {
    this.keys.delete(code)
  }

  setAction(action: Action, down: boolean): void {
    if (down) this.buttons.add(action)
    else this.buttons.delete(action)
  }

  isActive(action: Action): boolean {
    if (this.buttons.has(action)) return true
    for (const code of this.keys) if (actionFor(code) === action) return true
    return false
  }

  clear(): void {
    this.keys.clear()
    this.buttons.clear()
  }

  sample(): ShipIntent {
    const intent = idleIntent()
    intent.thrust = this.isActive('forward') ? 1 : 0
    intent.turn = (this.isActive('turnRight') ? 1 : 0) - (this.isActive('turnLeft') ? 1 : 0)
    intent.fire.front = this.isActive('fireFront')
    intent.fire.left = this.isActive('fireLeft')
    intent.fire.right = this.isActive('fireRight')
    return intent
  }
}
