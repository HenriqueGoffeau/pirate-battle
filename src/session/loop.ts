import { frameMs, type Clock } from '../shared/clock'

const maxFrameMs = 250

export type LoopHandlers = {
  isRunning(): boolean
  step(dtSeconds: number): void
  render(draw: boolean): void
}

export function startLoop(clock: Clock, handlers: LoopHandlers): () => void {
  let last = clock.now()
  let accumulator = 0
  return clock.onFrame((time, lastOfBatch) => {
    const frame = Math.min(time - last, maxFrameMs)
    last = time
    if (handlers.isRunning()) {
      accumulator += frame
      while (accumulator >= frameMs - 1e-6) {
        handlers.step(frameMs / 1000)
        accumulator -= frameMs
        if (!handlers.isRunning()) {
          accumulator = 0
          break
        }
      }
    } else {
      accumulator = 0
    }
    handlers.render(lastOfBatch)
  })
}
