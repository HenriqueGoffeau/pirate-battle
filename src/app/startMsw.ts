export async function startMsw(): Promise<boolean> {
  try {
    const { worker } = await import('../mocks/browser')
    await worker.start({ onUnhandledRequest: 'bypass', quiet: import.meta.env.PROD })
    document.body.dataset.mswReady = 'true'
    return true
  } catch {
    document.body.dataset.mswOffline = 'true'
    return false
  }
}
