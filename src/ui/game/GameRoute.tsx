import { lazy, Suspense } from 'react'
import styles from './GameHost.module.css'

const GameHost = lazy(() => import('./GameHost').then((module) => ({ default: module.GameHost })))

export function GameRoute() {
  return (
    <Suspense
      fallback={
        <div className={styles.root}>
          <p className={styles.status} role="status">
            Loading the fleet…
          </p>
        </div>
      }
    >
      <GameHost />
    </Suspense>
  )
}
