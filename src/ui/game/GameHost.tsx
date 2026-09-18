import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useSearchParams } from 'react-router'
import { createMatchConfig } from '../../config/matchConfig'
import { defaultOptions } from '../../config/userOptions'
import { GameSession } from '../../session/GameSession'
import { createSessionStore } from '../../session/store'
import styles from './GameHost.module.css'

const newSeed = () => Math.floor(Math.random() * 2 ** 31)

export function GameHost() {
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<GameSession | null>(null)
  const [store] = useState(createSessionStore)
  const [matchConfig] = useState(() => createMatchConfig(defaultOptions, newSeed()))
  const hud = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [searchParams] = useSearchParams()
  const debugOverlay = searchParams.get('dev') === '1'
  const mapId = matchConfig.arena.mapId

  useEffect(() => {
    const host = canvasHostRef.current
    if (!host) return
    const session = new GameSession(host, store, { matchConfig, debugOverlay })
    sessionRef.current = session
    void session.start()
    return () => {
      session.dispose()
      if (sessionRef.current === session) sessionRef.current = null
    }
  }, [matchConfig, debugOverlay, store])

  return (
    <div className={styles.root}>
      <div className={styles.canvasHost} ref={canvasHostRef} />
      {debugOverlay && hud.matchState !== 'loading' && (
        <p className={styles.legend} role="note">
          Map overlay · grid = columns/rows of scripts/maps/{mapId}.txt · <span className={styles.entry}>➜</span> enemy entry
          (enemies sail in from outside) · ◯ player start and heading · <span className={styles.solid}>□</span> solid ·{' '}
          <span className={styles.edge}>▭</span> edge push starts
        </p>
      )}
      {hud.matchState === 'loading' && (
        <p className={styles.status} role="status">
          Loading the fleet… {Math.round(hud.loadProgress * 100)}%
        </p>
      )}
      {hud.matchState === 'assetError' && (
        <div className={styles.status} role="alert">
          <p>The fleet could not be loaded.</p>
          <button type="button" onClick={() => sessionRef.current?.retry()}>
            Retry
          </button>
        </div>
      )}
    </div>
  )
}
