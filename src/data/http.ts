import axios, { AxiosError } from 'axios'
import type { ApiError, ApiErrorCode } from './contracts/types'
import { loadPlayer } from './local'

export const requestTimeoutMs = 8000

let offline = false

export const setOffline = (value: boolean) => {
  offline = value
}

export const isOffline = () => offline

export function apiError(status: number, code: ApiErrorCode, message: string, retryable?: boolean): ApiError {
  const transient = code === 'network' || code === 'timeout' || status >= 500 || status === 429
  return { status, code, message, retryable: retryable ?? transient }
}

export function isApiError(value: unknown): value is ApiError {
  if (typeof value !== 'object' || value === null) return false
  const candidate = value as Partial<ApiError>
  return typeof candidate.code === 'string' && typeof candidate.retryable === 'boolean' && typeof candidate.status === 'number'
}

const codeForStatus = (status: number): ApiErrorCode =>
  status === 404 ? 'not_found' : status === 409 ? 'conflict' : status === 400 || status === 422 ? 'validation' : 'server'

function serverMessage(body: unknown): string | null {
  if (typeof body !== 'object' || body === null || !('message' in body)) return null
  return typeof body.message === 'string' ? body.message : null
}

export function toApiError(error: unknown): ApiError {
  if (isApiError(error)) return error
  if (axios.isCancel(error)) return apiError(0, 'network', 'The request was cancelled.', false)
  if (!axios.isAxiosError(error)) return apiError(0, 'network', 'Something went wrong while talking to the server.')
  if (error.code === AxiosError.ECONNABORTED || error.code === AxiosError.ETIMEDOUT) {
    return apiError(0, 'timeout', 'The server took too long to answer.')
  }
  const response = error.response
  if (!response) return apiError(0, 'network', 'Couldn’t reach the server.')
  const message = serverMessage(response.data) ?? `The server answered ${response.status}.`
  return apiError(response.status, codeForStatus(response.status), message)
}

export const http = axios.create({ baseURL: '/api', timeout: requestTimeoutMs })

http.interceptors.request.use((config) => {
  if (offline) throw apiError(0, 'network', 'Offline mode: the ranking service is not running.', false)
  config.headers.set('X-Player-Id', loadPlayer().playerId)
  return config
})

http.interceptors.response.use(undefined, (error: unknown) => Promise.reject(toApiError(error)))
