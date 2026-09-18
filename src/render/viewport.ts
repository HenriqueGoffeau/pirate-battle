import type { Container, Renderer } from 'pixi.js'

export type Viewport = { detach(): void }

export type WorldSize = { width: number; height: number }

export function attachViewport(
  host: HTMLElement,
  renderer: Renderer,
  world: Container,
  size: WorldSize,
  onChange: () => void,
): Viewport {
  const fit = () => {
    const width = host.clientWidth
    const height = host.clientHeight
    if (width === 0 || height === 0) return
    renderer.resize(width, height)
    const scale = Math.min(width / size.width, height / size.height)
    world.scale.set(scale)
    world.position.set(Math.round((width - size.width * scale) / 2), Math.round((height - size.height * scale) / 2))
    onChange()
  }
  const observer = new ResizeObserver(fit)
  observer.observe(host)
  fit()
  return { detach: () => observer.disconnect() }
}
