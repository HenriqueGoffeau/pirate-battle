import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { setOffline } from '../data/http'
import { saveDevMode } from '../data/local'
import { startOutbox } from '../data/outbox'
import { Providers } from './providers'
import { router } from './router'
import { startMsw } from './startMsw'
import './global.css'

async function boot(): Promise<void> {
  const container = document.getElementById('root')
  if (!container) {
    throw new Error('Missing #root element')
  }
  const search = new URLSearchParams(window.location.search)
  const dev = search.get('dev')
  if (dev === '1' || dev === '0') saveDevMode(dev === '1')
  if (search.get('test') === '1') {
    const { installTestApi } = await import('../testing/testApi')
    installTestApi()
  }
  if (search.get('perf') === '1') {
    const { perfProbe } = await import('../session/perfProbe')
    perfProbe.enable()
  }
  const mocks = await startMsw(search)
  setOffline(mocks === null)
  startOutbox()
  createRoot(container).render(
    <StrictMode>
      <Providers mocks={mocks}>
        <RouterProvider router={router} />
      </Providers>
    </StrictMode>,
  )
}

void boot()
