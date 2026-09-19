import { lazy, Suspense, useState } from 'react'
import { Navigate, NavigationType, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router'
import { parseMatchRecord } from '../../data/contracts/record'
import { retrySave, saveStatusOf, useOutbox } from '../../data/outbox'
import { LoadingPanel } from './LoadingPanel'
import { ResultDialog } from './ResultDialog'
import styles from './GameHost.module.css'

const GameHost = lazy(() => import('./GameHost').then((module) => ({ default: module.GameHost })))

function readRecord(state: unknown) {
  if (typeof state !== 'object' || state === null || !('record' in state)) return null
  return parseMatchRecord(state.record)
}

const endFramePattern = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/

function readEndFrame(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('endFrame' in state)) return null
  return typeof state.endFrame === 'string' && endFramePattern.test(state.endFrame) ? state.endFrame : null
}

function MatchResult({ state }: { state: unknown }) {
  const navigate = useNavigate()
  const outbox = useOutbox()
  const record = readRecord(state) ?? outbox.lastResult?.record ?? null
  return (
    <ResultDialog
      record={record}
      status={record ? saveStatusOf(outbox, record.matchId) : null}
      onRetry={() => record && retrySave(record.matchId)}
      onPlayAgain={() => void navigate('/play', { replace: true })}
      onMainMenu={() => void navigate('/', { replace: true })}
    />
  )
}

export function GameRoute() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const [searchParams] = useSearchParams()
  const [playKey, setPlayKey] = useState<string | null>(null)
  const onPlay = location.pathname === '/play'

  if (onPlay && navigationType === NavigationType.Pop && searchParams.get('dev') !== '1') return <Navigate to="/" replace />
  if (onPlay && playKey !== location.key) setPlayKey(location.key)
  const matchKey = onPlay ? location.key : playKey
  const endFrame = matchKey ? null : readEndFrame(location.state)

  return (
    <>
      {matchKey ? (
        <Suspense
          fallback={
            <div className={styles.root}>
              <LoadingPanel progress={null} />
            </div>
          }
        >
          <GameHost key={matchKey} showingResult={!onPlay} />
        </Suspense>
      ) : (
        <div className={styles.backdrop} style={endFrame ? { backgroundImage: `url(${endFrame})` } : undefined} />
      )}
      {!onPlay && <MatchResult state={location.state} />}
    </>
  )
}
