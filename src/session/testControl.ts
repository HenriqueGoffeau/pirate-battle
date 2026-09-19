import { ManualClock, type Clock } from '../shared/clock'
import type { World } from '../sim/entities'
import type { MatchState, SessionStore } from './store'

export type InspectedSession = {
  readonly store: SessionStore
  readonly clock: Clock
  world(): World | null
  state(): MatchState
}

let enabled = false
let seed: number | null = null
let manualClock = false
let current: InspectedSession | null = null
const listeners = new Set<() => void>()

const notify = () => listeners.forEach((listener) => listener())

export const testControl = {
  enable(): void {
    enabled = true
  },
  isEnabled: () => enabled,
  setSeed(value: number): void {
    seed = value
  },
  seed: () => (enabled ? seed : null),
  useManualClock(): void {
    manualClock = true
  },
  clockForSession: (): Clock | undefined => (enabled && manualClock ? new ManualClock() : undefined),
  attach(session: InspectedSession): void {
    if (!enabled) return
    current = session
    notify()
  },
  detach(session: InspectedSession): void {
    if (current !== session) return
    current = null
    notify()
  },
  current: () => current,
  subscribe(listener: () => void): () => void {
    listeners.add(listener)
    return () => {
      listeners.delete(listener)
    }
  },
}
