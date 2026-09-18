import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { RouterProvider } from 'react-router'
import { router } from './router'
import { startMsw } from './startMsw'
import './global.css'

async function boot(): Promise<void> {
  const container = document.getElementById('root')
  if (!container) {
    throw new Error('Missing #root element')
  }
  await startMsw()
  createRoot(container).render(
    <StrictMode>
      <RouterProvider router={router} />
    </StrictMode>,
  )
}

void boot()
