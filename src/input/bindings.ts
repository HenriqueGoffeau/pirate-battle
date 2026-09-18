export type Action = 'forward' | 'turnLeft' | 'turnRight' | 'fireFront' | 'fireLeft' | 'fireRight' | 'pause'

export const bindings: Readonly<Record<string, Action>> = Object.freeze({
  KeyW: 'forward',
  ArrowUp: 'forward',
  KeyA: 'turnLeft',
  ArrowLeft: 'turnLeft',
  KeyD: 'turnRight',
  ArrowRight: 'turnRight',
  Space: 'fireFront',
  KeyQ: 'fireLeft',
  KeyE: 'fireRight',
  KeyP: 'pause',
  Escape: 'pause',
})

export const actionFor = (code: string): Action | null => (Object.hasOwn(bindings, code) ? bindings[code] : null)
