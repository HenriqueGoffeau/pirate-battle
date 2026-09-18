import { actionFor } from './bindings'
import type { InputState } from './inputState'

export function attachKeyboard(state: InputState, target: Window = window): () => void {
  const onKeyDown = (event: KeyboardEvent) => {
    if (!actionFor(event.code)) return
    event.preventDefault()
    if (!event.repeat) state.keyDown(event.code)
  }
  const onKeyUp = (event: KeyboardEvent) => {
    if (!actionFor(event.code)) return
    event.preventDefault()
    state.keyUp(event.code)
  }
  const onBlur = () => state.clear()
  target.addEventListener('keydown', onKeyDown)
  target.addEventListener('keyup', onKeyUp)
  target.addEventListener('blur', onBlur)
  return () => {
    target.removeEventListener('keydown', onKeyDown)
    target.removeEventListener('keyup', onKeyUp)
    target.removeEventListener('blur', onBlur)
  }
}
