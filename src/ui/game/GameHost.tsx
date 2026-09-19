import { useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { createMatchConfig } from '../../config/matchConfig'
import { loadOptions } from '../../data/local'
import { GameSession } from '../../session/GameSession'
import { portraitQuery } from '../../session/lifecycle'
import { createSessionStore, type MatchResult, type MatchState } from '../../session/store'
import { LiveRegion } from '../a11y/LiveRegion'
import { useMatchAnnouncer } from '../a11y/useMatchAnnouncer'
import { useMediaQuery } from '../components/useMediaQuery'
import { Hud, type HudHandle } from './Hud'
import { LoadErrorPanel, LoadingPanel } from './LoadingPanel'
import { PauseDialog } from './PauseDialog'
import { RotateOverlay } from './RotateOverlay'
import { TouchControls, type TouchControlsHandle } from './TouchControls'
import styles from './GameHost.module.css'

const newSeed = () => Math.floor(Math.random() * 2 ** 31)
const endHoldMs = 1200
const matchStates: ReadonlySet<MatchState> = new Set(['ready', 'running', 'paused', 'resuming', 'ended'])

type GameHostProps = { showingResult: boolean }

export function GameHost({ showingResult }: GameHostProps) {
  const canvasHostRef = useRef<HTMLDivElement>(null)
  const sessionRef = useRef<GameSession | null>(null)
  const resultRef = useRef<MatchResult | null>(null)
  const hudRef = useRef<HudHandle>(null)
  const touchRef = useRef<TouchControlsHandle>(null)
  const [store] = useState(createSessionStore)
  const [matchConfig] = useState(() => createMatchConfig(loadOptions(), newSeed()))
  const hud = useSyncExternalStore(store.subscribe, store.getSnapshot)
  const portrait = useMediaQuery(portraitQuery)
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const debugOverlay = searchParams.get('dev') === '1'
  const mapId = matchConfig.arena.mapId
  const { matchState } = hud

  const liveRef = useMatchAnnouncer(hud)

  useEffect(() => {
    const host = canvasHostRef.current
    if (!host) return
    const session = new GameSession(host, store, { matchConfig, debugOverlay })
    sessionRef.current = session
    const offFired = session.on('weaponFired', ({ side, cooldownMs }) => touchRef.current?.sweep(side, cooldownMs))
    const offHit = session.on('playerHit', () => hudRef.current?.flash())
    void session.start()
    return () => {
      offFired()
      offHit()
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

  const toMenu = () => void navigate('/', { replace: true })

  return (
    <div className={styles.root}>
      <div className={styles.canvasHost} ref={canvasHostRef} />
      {matchStates.has(matchState) && (
        <Hud
          ref={hudRef}
          hud={hud}
          canPause={matchState === 'running' || matchState === 'resuming'}
          onPause={() => sessionRef.current?.pause()}
        />
      )}
      {matchStates.has(matchState) && matchState !== 'ended' && (
        <TouchControls ref={touchRef} onAction={(action, down) => sessionRef.current?.input.setAction(action, down)} />
      )}
      {debugOverlay && matchState !== 'loading' && (
        <p className={styles.legend} role="note">
          Map overlay · grid = columns/rows of scripts/maps/{mapId}.txt · <span className={styles.entry}>➜</span> enemy entry
          (enemies sail in from outside) · ◯ player start and heading · <span className={styles.solid}>□</span> solid ·{' '}
          <span className={styles.edge}>▭</span> edge push starts
        </p>
      )}
      {matchState === 'loading' && <LoadingPanel progress={hud.loadProgress} />}
      {matchState === 'assetError' && <LoadErrorPanel onRetry={() => sessionRef.current?.retry()} onMenu={toMenu} />}
      {matchState === 'ended' && !showingResult && (
        <p className={`${styles.banner} ${hud.endReason === 'defeated' ? styles.defeated : ''}`} aria-hidden="true">
          {hud.endReason === 'defeated' ? 'Your ship was sunk!' : "Time's up!"}
        </p>
      )}
      {portrait && matchState !== 'ended' && <RotateOverlay />}
      <PauseDialog
        open={matchState === 'paused' && !portrait}
        onResume={() => sessionRef.current?.resume()}
        onMainMenu={toMenu}
      />
      <LiveRegion ref={liveRef} />
    </div>
  )
}
