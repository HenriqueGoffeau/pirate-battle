import { keepPreviousData, QueryClient, useQuery, type MutationObserverOptions } from '@tanstack/react-query'
import { getHistory, getRanking, putMatch } from './api'
import { pageSize, type ApiError, type MatchRecord, type SaveOutcome } from './contracts/types'

declare module '@tanstack/react-query' {
  interface Register {
    defaultError: ApiError
  }
}

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 15_000,
      gcTime: 5 * 60_000,
      networkMode: 'always',
      retry: (failureCount, error) => error.retryable === true && failureCount < 2,
      retryDelay: (attempt) => Math.min(1000 * 2 ** attempt, 8000),
      refetchOnMount: 'always',
      refetchOnWindowFocus: true,
    },
    mutations: { networkMode: 'always', retry: 0 },
  },
})

export const queryKeys = {
  ranking: (configKey: string, page: number) => ['ranking', configKey, page] as const,
  history: (playerId: string, page: number) => ['history', playerId, page] as const,
}

export function useRanking(configKey: string, page: number) {
  return useQuery({
    queryKey: queryKeys.ranking(configKey, page),
    queryFn: ({ signal }) => getRanking({ configKey, page, pageSize }, signal),
    placeholderData: keepPreviousData,
  })
}

export function useHistory(playerId: string, page: number) {
  return useQuery({
    queryKey: queryKeys.history(playerId, page),
    queryFn: ({ signal }) => getHistory({ playerId, page, pageSize }, signal),
    placeholderData: keepPreviousData,
  })
}

export type SaveVariables = { record: MatchRecord; signal: AbortSignal }

export const saveMatchOptions: MutationObserverOptions<SaveOutcome, ApiError, SaveVariables> = {
  mutationKey: ['saveMatch'],
  mutationFn: ({ record, signal }) => putMatch(record, signal),
  onSuccess: () => {
    void queryClient.invalidateQueries({ queryKey: ['ranking'] })
    void queryClient.invalidateQueries({ queryKey: ['history'] })
  },
}
