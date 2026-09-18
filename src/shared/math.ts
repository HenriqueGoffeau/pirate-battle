export const TAU = Math.PI * 2

export const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

export const degToRad = (degrees: number) => (degrees * Math.PI) / 180

export function wrapAngle(angle: number): number {
  return ((((angle + Math.PI) % TAU) + TAU) % TAU) - Math.PI
}

export function approach(value: number, target: number, delta: number): number {
  return value < target ? Math.min(target, value + delta) : Math.max(target, value - delta)
}

export function segmentCircle(x0: number, y0: number, x1: number, y1: number, cx: number, cy: number, r: number): number | null {
  const fx = x0 - cx
  const fy = y0 - cy
  const c = fx * fx + fy * fy - r * r
  if (c <= 0) return 0
  const dx = x1 - x0
  const dy = y1 - y0
  const a = dx * dx + dy * dy
  if (a === 0) return null
  const b = 2 * (fx * dx + fy * dy)
  const discriminant = b * b - 4 * a * c
  if (discriminant < 0) return null
  const t = (-b - Math.sqrt(discriminant)) / (2 * a)
  return t >= 0 && t <= 1 ? t : null
}

export function deepFreeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.freeze(value)
    for (const key of Object.keys(value)) deepFreeze((value as Record<string, unknown>)[key])
  }
  return value
}

export function deepEqual(a: unknown, b: unknown): boolean {
  if (Object.is(a, b)) return true
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false
  if (Array.isArray(a) !== Array.isArray(b)) return false
  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false
  return keysA.every((key) => deepEqual((a as Record<string, unknown>)[key], (b as Record<string, unknown>)[key]))
}
