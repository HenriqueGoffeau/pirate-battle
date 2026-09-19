import { setupWorker } from 'msw/browser'
import { loadPlayer } from '../data/local'
import { loadDb, resetDb } from './fakeDb'
import { handlers } from './handlers'
import { clearRequestLog, getRequestLog, subscribeRequestLog } from './requestLog'
import {
  datasetOf,
  getScenario,
  isScenarioId,
  resetCounters,
  scenarioIds,
  scenarios,
  setActiveScenario,
} from './scenarios'

export const worker = setupWorker(...handlers)

export type MockStartOptions = { scenario: string | null; reset: boolean }

function resetServer(): void {
  resetDb(datasetOf(getScenario()), loadPlayer())
  resetCounters()
  clearRequestLog()
}

function selectScenario(id: string): void {
  if (!isScenarioId(id)) return
  setActiveScenario(id)
  loadDb(datasetOf(id), loadPlayer())
}

export function prepareMocks({ scenario, reset }: MockStartOptions): void {
  if (isScenarioId(scenario)) setActiveScenario(scenario)
  if (reset) resetServer()
  else loadDb(datasetOf(getScenario()), loadPlayer())
}

export const mockControls = {
  scenarios: scenarioIds.map((id) => ({ id, label: scenarios[id].label, description: scenarios[id].description })),
  getScenario,
  setScenario: selectScenario,
  resetServer,
  getRequestLog,
  subscribe: subscribeRequestLog,
}
