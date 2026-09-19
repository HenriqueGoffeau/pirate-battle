import { createRng, type Rng } from '../shared/rng'
import { readStored, writeStored } from '../shared/storage'

export const scenarioIds = [
  'success',
  'empty',
  'manyPages',
  'slow',
  'jitter',
  'outOfOrder',
  'timeout',
  'networkError',
  'http4xx',
  'http5xx',
  'rankingFails',
  'historyFails',
  'timeoutAfterSave',
  'downThenRecover',
] as const

export type ScenarioId = (typeof scenarioIds)[number]
export type Dataset = 'fixtures' | 'empty' | 'manyPages'
export type Endpoint = 'ranking' | 'configs' | 'history' | 'save'
export type Failure = 'network' | 'timeout' | number
export type RequestPlan = { latencyMs: number; failure: Failure | null; hangAfterCreate: boolean }

type PlanContext = { endpoint: Endpoint; index: number; saveIndex: number; rng: Rng }

type Scenario = {
  label: string
  description: string
  dataset: Dataset
  plan?(context: PlanContext): Partial<RequestPlan>
}

export const baseLatencyMs = 150
export const hangMs = 12_000

const scenarioKey = 'pb:v1:scenario'
const jitterSeed = 0x5eed

const readsRanking = (endpoint: Endpoint) => endpoint === 'ranking' || endpoint === 'configs'

export const scenarios: Record<ScenarioId, Scenario> = {
  success: { label: 'Success', description: 'Fixtures, about 150 ms per request.', dataset: 'fixtures' },
  empty: { label: 'Empty', description: 'The server starts with no records.', dataset: 'empty' },
  manyPages: {
    label: 'Many pages',
    description: 'Fixtures plus seven of your battles: ranking 3 pages, match history 2 pages.',
    dataset: 'manyPages',
  },
  slow: { label: 'Slow', description: 'Every request takes 2.5 s.', dataset: 'fixtures', plan: () => ({ latencyMs: 2500 }) },
  jitter: {
    label: 'Jitter',
    description: 'Seeded latency between 100 and 2000 ms (same sequence after every reset).',
    dataset: 'fixtures',
    plan: ({ rng }) => ({ latencyMs: 100 + Math.round(rng.next() * 1900) }),
  },
  outOfOrder: {
    label: 'Out of order',
    description: 'Odd requests take 3 s, even ones 300 ms, so an earlier request answers after a later one.',
    dataset: 'fixtures',
    plan: ({ index }) => ({ latencyMs: index % 2 === 1 ? 3000 : 300 }),
  },
  timeout: {
    label: 'Timeout',
    description: 'Every request hangs 12 s; the client gives up after 8 s.',
    dataset: 'fixtures',
    plan: () => ({ failure: 'timeout' }),
  },
  networkError: {
    label: 'Network error',
    description: 'Every request fails with a connection error.',
    dataset: 'fixtures',
    plan: () => ({ failure: 'network' }),
  },
  http4xx: { label: 'HTTP 422', description: 'Every request answers 422.', dataset: 'fixtures', plan: () => ({ failure: 422 }) },
  http5xx: { label: 'HTTP 503', description: 'Every request answers 503.', dataset: 'fixtures', plan: () => ({ failure: 503 }) },
  rankingFails: {
    label: 'Ranking fails',
    description: 'Ranking requests answer 503; match history and saving work.',
    dataset: 'fixtures',
    plan: ({ endpoint }) => (readsRanking(endpoint) ? { failure: 503 } : {}),
  },
  historyFails: {
    label: 'History fails',
    description: 'Match history requests answer 503; ranking and saving work.',
    dataset: 'fixtures',
    plan: ({ endpoint }) => (endpoint === 'history' ? { failure: 503 } : {}),
  },
  timeoutAfterSave: {
    label: 'Timeout after save',
    description: 'A new record is stored, then the answer hangs 12 s. The retry gets the stored record back, no duplicate.',
    dataset: 'fixtures',
    plan: ({ endpoint }) => (endpoint === 'save' ? { hangAfterCreate: true } : {}),
  },
  downThenRecover: {
    label: 'Down, then recover',
    description: 'Saving answers 503 until the third attempt; reading works.',
    dataset: 'fixtures',
    plan: ({ endpoint, saveIndex }) => (endpoint === 'save' && saveIndex < 3 ? { failure: 503 } : {}),
  },
}

export const isScenarioId = (value: unknown): value is ScenarioId =>
  typeof value === 'string' && (scenarioIds as readonly string[]).includes(value)

let active: ScenarioId = readStored(scenarioKey, (data) => (isScenarioId(data) ? data : null)) ?? 'success'
let requestCount = 0
let saveCount = 0
let rng = createRng(jitterSeed)

export const getScenario = () => active

export const datasetOf = (id: ScenarioId) => scenarios[id].dataset

export function resetCounters(): void {
  requestCount = 0
  saveCount = 0
  rng = createRng(jitterSeed)
}

export function setActiveScenario(id: ScenarioId): void {
  active = id
  writeStored(scenarioKey, id)
  resetCounters()
}

export function planRequest(endpoint: Endpoint): RequestPlan {
  requestCount += 1
  if (endpoint === 'save') saveCount += 1
  const plan = scenarios[active].plan?.({ endpoint, index: requestCount, saveIndex: saveCount, rng }) ?? {}
  return { latencyMs: baseLatencyMs, failure: null, hangAfterCreate: false, ...plan }
}
