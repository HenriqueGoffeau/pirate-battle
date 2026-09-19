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

export const actionLabels: Readonly<Record<Action, string>> = Object.freeze({
  forward: 'Sail forward',
  turnLeft: 'Turn left',
  turnRight: 'Turn right',
  fireFront: 'Fire bow cannon',
  fireLeft: 'Broadside left',
  fireRight: 'Broadside right',
  pause: 'Pause',
})

const keyNames: Readonly<Record<string, string>> = { ArrowUp: '↑', ArrowLeft: '←', ArrowRight: '→', Escape: 'Esc' }

export const keyLabel = (code: string) => keyNames[code] ?? code.replace(/^Key/, '')

export const keysFor = (action: Action) => Object.keys(bindings).filter((code) => bindings[code] === action)
