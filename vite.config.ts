import { defineConfig } from 'vitest/config'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'

function reloadOnMapChange(): Plugin {
  return {
    name: 'pirate-battle:reload-on-map-change',
    configureServer(server) {
      server.watcher.on('change', (file) => {
        if (/[\\/]public[\\/]maps[\\/][^\\/]+\.json$/.test(file)) server.ws.send({ type: 'full-reload' })
      })
    },
  }
}

export default defineConfig({
  plugins: [react(), reloadOnMapChange()],
  build: {
    assetsDir: 'static',
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
})
