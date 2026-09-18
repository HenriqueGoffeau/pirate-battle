import { lazy, Suspense } from 'react'
import styles from './GameHost.module.css'

const GameHost = lazy(() => import('./GameHost').then((module) => ({ default: module.GameHost })))

type GameRouteProps = { mapId: string }

export function GameRoute({ mapId }: GameRouteProps) {
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
      <GameHost mapId={mapId} />
    </Suspense>
  )
}
