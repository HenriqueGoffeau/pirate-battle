import type { MockControls } from '../ui/dev/devControls'

export async function startMsw(search: URLSearchParams): Promise<MockControls | null> {
  try {
    const { worker, prepareMocks, mockControls } = await import('../mocks/browser')
    prepareMocks({ scenario: search.get('scenario'), reset: search.get('reset') === '1' })
    await worker.start({ onUnhandledRequest: 'bypass', quiet: import.meta.env.PROD })
    document.body.dataset.mswReady = 'true'
    return mockControls
  } catch {
    document.body.dataset.mswOffline = 'true'
    return null
  }
}
