export type FrameCallback = (time: number, lastOfBatch: boolean) => void

export interface Clock {
  now(): number
  onFrame(callback: FrameCallback): () => void
}

export class RealClock implements Clock {
  now(): number {
    return performance.now()
  }

  onFrame(callback: FrameCallback): () => void {
    let handle = requestAnimationFrame(function tick(time) {
      callback(time, true)
      handle = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(handle)
  }
}

export const frameMs = 1000 / 60

export class ManualClock implements Clock {
  private time = 0
  private nextFrameAt = frameMs
  private readonly callbacks = new Set<FrameCallback>()

  now(): number {
    return this.time
  }

  onFrame(callback: FrameCallback): () => void {
    this.callbacks.add(callback)
    return () => {
      this.callbacks.delete(callback)
    }
  }

  advance(ms: number, afterFrame?: () => void): void {
    const end = this.time + ms
    while (this.nextFrameAt <= end + 1e-6) {
      this.time = this.nextFrameAt
      this.nextFrameAt += frameMs
      const last = this.nextFrameAt > end + 1e-6
      this.callbacks.forEach((callback) => callback(this.time, last))
      afterFrame?.()
    }
    this.time = end
  }
}
