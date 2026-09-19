import { actionFor } from '../shared/bindings'
import type { InputState } from './inputState'

export function attachKeyboard(state: InputState, onPause: () => void, target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    const action = actionFor(event.code)
    if (!action || event.ctrlKey || event.metaKey || event.altKey) return
    event.preventDefault()
    if (event.repeat) return
    if (action === 'pause') onPause()
    else state.keyDown(event.code)
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (!actionFor(event.code)) return
    event.preventDefault()
    state.keyUp(event.code)
  }
  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  return () => {
    target.removeEventListener('keydown', onKeyDown)
    target.removeEventListener('keyup', onKeyUp)
  }
}
