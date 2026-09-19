import type { MatchConfig } from '../config/matchConfig'
import type { EndReason } from '../sim/entities'

export type MatchState = 'loading' | 'assetError' | 'ready' | 'running' | 'paused' | 'resuming' | 'ended'

export type HudSnapshot = {
  matchState: MatchState
  endReason?: EndReason
  score: number
  timeLeftSec: number
  health: number
  maxHealth: number
  loadProgress: number
}

export type MatchResult = {
  score: number
  effectiveSec: number
  endReason: EndReason
  matchConfig: MatchConfig
  seed: number
}

export type SessionStore = {
  getSnapshot(): HudSnapshot
  subscribe(listener: () => void): () => void
  publish(patch: Partial<HudSnapshot>): void
}

const initialHud: HudSnapshot = {
  matchState: 'loading',
  score: 0,
  timeLeftSec: 0,
  health: 0,
  maxHealth: 0,
  loadProgress: 0,
}

export function createSessionStore(): SessionStore {
  let snapshot = initialHud
  const listeners = new Set<() => void>()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) {
      listeners.add(listener)
      return () => {
        listeners.delete(listener)
      }
    },
    publish(patch) {
      const keys = Object.keys(patch) as Array<keyof HudSnapshot>
      if (keys.every((key) => Object.is(patch[key], snapshot[key]))) return
      snapshot = { ...snapshot, ...patch }
      listeners.forEach((listener) => listener())
    },
  }
}
