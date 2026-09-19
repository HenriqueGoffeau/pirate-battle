import { describe, expect, it } from 'vitest'
import { compareRanking } from './ranking'

const entry = (matchId: string, score: number, effectiveSec: number, playedAt: string) => ({
  matchId,
  score,
  effectiveSec,
  playedAt,
})

const ids = (entries: ReturnType<typeof entry>[]) => entries.map((item) => item.matchId)

describe('compareRanking', () => {
  it('puts the higher score first', () => {
    const low = entry('a', 12, 60, '2026-09-01T10:00:00.000Z')
    const high = entry('b', 30, 120, '2026-09-02T10:00:00.000Z')
    expect(ids([low, high].sort(compareRanking))).toEqual(['b', 'a'])
  })

  it('breaks a score tie by the shorter effective duration', () => {
    const survivor = entry('a', 19, 120, '2026-09-01T10:00:00.000Z')
    const faster = entry('b', 19, 96, '2026-09-05T10:00:00.000Z')
    expect(ids([survivor, faster].sort(compareRanking))).toEqual(['b', 'a'])
  })

  it('breaks a score and duration tie by the earlier date', () => {
    const later = entry('a', 12, 120, '2026-09-05T09:05:00.000Z')
    const earlier = entry('b', 12, 120, '2026-09-02T16:40:00.000Z')
    expect(ids([later, earlier].sort(compareRanking))).toEqual(['b', 'a'])
  })

  it('breaks a full tie by matchId ascending', () => {
    const second = entry('f0000000-0000-4000-8000-000000000002', 8, 45, '2026-09-01T10:00:00.000Z')
    const first = entry('f0000000-0000-4000-8000-000000000001', 8, 45, '2026-09-01T10:00:00.000Z')
    expect(ids([second, first].sort(compareRanking))).toEqual([first.matchId, second.matchId])
    expect(compareRanking(first, first)).toBe(0)
  })

  it('gives the same order whatever the input order', () => {
    const entries = [
      entry('e', 12, 120, '2026-09-05T09:05:00.000Z'),
      entry('a', 38, 120, '2026-09-08T19:42:00.000Z'),
      entry('d', 12, 120, '2026-09-02T16:40:00.000Z'),
      entry('c', 19, 96, '2026-09-05T21:30:00.000Z'),
      entry('b', 19, 120, '2026-09-04T17:48:00.000Z'),
      entry('f', 12, 74, '2026-09-01T19:55:00.000Z'),
    ]
    const expected = ['a', 'c', 'b', 'f', 'd', 'e']
    expect(ids([...entries].sort(compareRanking))).toEqual(expected)
    expect(ids([...entries].reverse().sort(compareRanking))).toEqual(expected)
  })
})
