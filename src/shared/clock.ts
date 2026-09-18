export interface Clock {
  now(): number
  onFrame(callback: (time: number) => void): () => void
}

export class RealClock implements Clock {
  now(): number {
    return performance.now()
  }

  onFrame(callback: (time: number) => void): () => void {
    let handle = requestAnimationFrame(function tick(time) {
      callback(time)
      handle = requestAnimationFrame(tick)
    })
    return () => cancelAnimationFrame(handle)
  }
}

export const frameMs = 1000 / 60

export class ManualClock implements Clock {
  private time = 0
  private nextFrameAt = frameMs
  private readonly callbacks = new Set<(time: number) => void>()

  now(): number {
    return this.time
  }

  onFrame(callback: (time: number) => void): () => void {
    this.callbacks.add(callback)
    return () => {
      this.callbacks.delete(callback)
    }
  }

  advance(ms: number): void {
    const end = this.time + ms
    while (this.nextFrameAt <= end + 1e-6) {
      this.time = this.nextFrameAt
      this.nextFrameAt += frameMs
      this.callbacks.forEach((callback) => callback(this.time))
    }
    this.time = end
  }
}
