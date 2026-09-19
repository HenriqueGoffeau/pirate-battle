import { delay, http, HttpResponse } from 'msw'
import { parseMatchRecord, recordProblem } from '../data/contracts/record'
import { pageSize as defaultPageSize, type ApiErrorBody, type ApiErrorCode } from '../data/contracts/types'
import { configSummaries, historyPage, insertRecord, rankingPage } from './fakeDb'
import { beginRequest, endRequest } from './requestLog'
import { getScenario, hangMs, planRequest, type Endpoint, type RequestPlan } from './scenarios'

const statusText: Record<number, string> = {
  409: 'This matchId already holds a different record.',
  422: 'The request was rejected as invalid.',
  503: 'The service is unavailable. Try again shortly.',
  504: 'The server gave up waiting.',
}

const codeFor = (status: number): ApiErrorCode =>
  status === 404 ? 'not_found' : status === 409 ? 'conflict' : status === 422 ? 'validation' : 'server'

function problem(status: number, message = statusText[status] ?? `Error ${status}.`) {
  return HttpResponse.json<ApiErrorBody>({ code: codeFor(status), message }, { status })
}

function positiveInt(value: string | null, fallback: number, max: number): number {
  const parsed = Number(value)
  return Number.isInteger(parsed) && parsed >= 1 ? Math.min(parsed, max) : fallback
}

const pageOf = (url: URL) => positiveInt(url.searchParams.get('page'), 1, 10_000)
const pageSizeOf = (url: URL) => positiveInt(url.searchParams.get('pageSize'), defaultPageSize, 50)

async function failure(plan: RequestPlan): Promise<Response | null> {
  if (plan.failure === null) return null
  if (plan.failure === 'network') return HttpResponse.error()
  if (plan.failure === 'timeout') {
    await delay(hangMs)
    return problem(504)
  }
  return problem(plan.failure)
}

async function serve(
  endpoint: Endpoint,
  request: Request,
  respond: (plan: RequestPlan) => Response | Promise<Response>,
): Promise<Response> {
  const url = new URL(request.url)
  const started = performance.now()
  const id = beginRequest(request.method, `${url.pathname}${url.search}`, getScenario())
  const plan = planRequest(endpoint)
  await delay(plan.latencyMs)
  const response = (await failure(plan)) ?? (await respond(plan))
  endRequest(id, response.type === 'error' ? 'network error' : response.status, Math.round(performance.now() - started))
  return response
}

export const handlers = [
  http.get('/api/ranking/configs', ({ request }) => serve('configs', request, () => HttpResponse.json(configSummaries()))),

  http.get('/api/ranking', ({ request }) =>
    serve('ranking', request, () => {
      const url = new URL(request.url)
      const configKey = url.searchParams.get('configKey')
      if (!configKey) return problem(422, 'configKey is required.')
      const viewerId = request.headers.get('X-Player-Id') ?? ''
      return HttpResponse.json(rankingPage(configKey, pageOf(url), pageSizeOf(url), viewerId))
    }),
  ),

  http.get('/api/players/:playerId/matches', ({ request, params }) =>
    serve('history', request, () => {
      const url = new URL(request.url)
      return HttpResponse.json(historyPage(String(params.playerId), pageOf(url), pageSizeOf(url)))
    }),
  ),

  http.put('/api/matches/:matchId', ({ request, params }) =>
    serve('save', request, async (plan) => {
      const record = parseMatchRecord(await request.json().catch(() => null))
      if (!record) return problem(422, 'The record is incomplete or malformed.')
      if (record.matchId !== params.matchId) return problem(422, 'The matchId in the path and in the body differ.')
      const invalid = recordProblem(record)
      if (invalid) return problem(422, invalid)
      const saved = insertRecord(record)
      if (saved.outcome === 'conflict') return problem(409)
      if (saved.outcome === 'created' && plan.hangAfterCreate) await delay(hangMs)
      return HttpResponse.json(saved.record, { status: saved.outcome === 'created' ? 201 : 200 })
    }),
  ),
]
