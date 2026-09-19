import { createContext, useContext } from 'react'

export type ScenarioInfo = { id: string; label: string; description: string }

export type RequestLogEntry = {
  id: number
  method: string
  path: string
  scenario: string
  status: number | 'network error' | null
  ms: number | null
}

export type MockControls = {
  scenarios: readonly ScenarioInfo[]
  getScenario(): string
  setScenario(id: string): void
  resetServer(): void
  getRequestLog(): readonly RequestLogEntry[]
  subscribe(listener: () => void): () => void
}

export const DevControlsContext = createContext<MockControls | null>(null)

export const useDevControls = () => useContext(DevControlsContext)
