import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { createMatchConfig } from '../../config/matchConfig'
import { defaultOptions } from '../../config/userOptions'
import { GameSession } from '../../session/GameSession'
import { createSessionStore, type MatchResult, type MatchState } from '../../session/store'
import { Hud } from './Hud'
import { PauseDialog } from './PauseDialog'
import styles from './GameHost.module.css'

const newSeed = () => Math.floor(Math.random() * 2 ** 31)
const endHoldMs = 1200
const matchStates: ReadonlySet<MatchState> = new Set(['ready', 'running', 'paused', 'resuming', 'ended'])

type GameHostProps = { showingResult: boolean }

export function GameHost({ showingResult }: GameHostProps) {
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<GameSession | null>(null)
  const resultRef = useRef<MatchResult | null>(null)
  const [store] = useState(createSessionStore)
  const [matchConfig] = useState(() => createMatchConfig(defaultOptions, newSeed()))
  const hud = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const debugOverlay = searchParams.get('dev') === '1'
  const mapId = matchConfig.arena.mapId
  const { matchState } = hud

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

  useEffect(() => {
    if (matchState !== 'ended') return
    resultRef.current ??= sessionRef.current?.getResult() ?? null
    const result = resultRef.current
    if (!result) return
    const timer = window.setTimeout(() => {
      const endFrame = sessionRef.current?.getEndFrame() ?? null
      void navigate('/result', { replace: true, state: { result, endFrame } })
    }, endHoldMs)
    return () => window.clearTimeout(timer)
  }, [matchState, navigate])

  return (
    <div className={styles.root}>
      <div className={styles.canvasHost} ref={canvasHostRef} />
      {matchStates.has(matchState) && (
        <Hud
          hud={hud}
          canPause={matchState === 'running' || matchState === 'resuming'}
          onPause={() => sessionRef.current?.pause()}
        />
      )}
      {debugOverlay && matchState !== 'loading' && (
        <p className={styles.legend} role="note">
          Map overlay · grid = columns/rows of scripts/maps/{mapId}.txt · <span className={styles.entry}>➜</span> enemy entry
          (enemies sail in from outside) · ◯ player start and heading · <span className={styles.solid}>□</span> solid ·{' '}
          <span className={styles.edge}>▭</span> edge push starts
        </p>
      )}
      {matchState === 'loading' && (
        <p className={styles.status} role="status">
          Loading the fleet… {Math.round(hud.loadProgress * 100)}%
        </p>
      )}
      {matchState === 'assetError' && (
        <div className={styles.status} role="alert">
          <p>The fleet could not be loaded.</p>
          <button type="button" onClick={() => sessionRef.current?.retry()}>
            Retry
          </button>
        </div>
      )}
      {matchState === 'ended' && !showingResult && (
        <p className={`${styles.banner} ${hud.endReason === 'defeated' ? styles.defeated : ''}`} role="status">
          {hud.endReason === 'defeated' ? 'Your ship was sunk!' : "Time's up!"}
        </p>
      )}
      <PauseDialog
        open={matchState === 'paused'}
        onResume={() => sessionRef.current?.resume()}
        onMainMenu={() => void navigate('/', { replace: true })}
      />
    </div>
  )
}
