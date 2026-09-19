import { useState, type ReactNode } from 'react'
import { isOffline } from '../../data/http'
import { loadDevMode, saveDevMode } from '../../data/local'
import { DevPanel } from '../dev/DevPanel'
import logoUrl from '../sprites/logo_jungle_gaming.svg'
import styles from './MenuScene.module.css'

export function MenuScene({ children }: { children: ReactNode }) {
  const [devMode, setDevMode] = useState(loadDevMode)
  const [devOpen, setDevOpen] = useState(false)

  const disableDev = () => {
    saveDevMode(false)
    setDevOpen(false)
    setDevMode(false)
  }

  return (
    <div className={styles.scene}>
      {isOffline() && (
        <p className={styles.offline} role="status">
          Offline mode: ranking and history are unavailable. Battles still work and wait on this device.
        </p>
      )}
      <main className={styles.main}>{children}</main>
      <footer className={styles.footer}>
        <span className={styles.build}>Build {import.meta.env.VITE_COMMIT_SHA ?? 'dev'}</span>
        <img className={styles.logo} src={logoUrl} alt="Jungle Gaming" />
      </footer>
      {devMode && (
        <button type="button" className={styles.devButton} onClick={() => setDevOpen(true)}>
          Dev tools
        </button>
      )}
      {devMode && <DevPanel open={devOpen} onClose={() => setDevOpen(false)} onDisable={disableDev} />}
    </div>
  )
}
