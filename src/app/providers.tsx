import { QueryClientProvider } from '@tanstack/react-query'
import type { ReactNode } from 'react'
import { queryClient } from '../data/queries'
import { DevControlsContext, type MockControls } from '../ui/dev/devControls'

type ProvidersProps = { mocks: MockControls | null; children: ReactNode }

export function Providers({ mocks, children }: ProvidersProps) {
  return (
    <QueryClientProvider client={queryClient}>
      <DevControlsContext value={mocks}>{children}</DevControlsContext>
    </QueryClientProvider>
  )
}
