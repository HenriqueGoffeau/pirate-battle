import { describe, expect, it } from 'vitest'
import { segmentCircle } from './math'

describe('segmentCircle', () => {
  it('returns the entry point of a segment crossing the circle', () => {
    expect(segmentCircle(0, 0, 10, 0, 6, 0, 1)).toBeCloseTo(0.5)
  })

  it('returns null when the segment misses or stops short', () => {
    expect(segmentCircle(0, 0, 10, 0, 5, 3, 1)).toBeNull()
    expect(segmentCircle(0, 0, 3, 0, 6, 0, 1)).toBeNull()
  })

  it('returns 0 when the segment starts inside the circle', () => {
    expect(segmentCircle(6, 0, 10, 0, 6, 0, 1)).toBe(0)
  })
})
