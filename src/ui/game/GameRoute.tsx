import { lazy, Suspense, useState } from 'react'
import { Navigate, NavigationType, useLocation, useNavigate, useNavigationType, useSearchParams } from 'react-router'
import type { MatchResult } from '../../session/store'
import { ResultDialog } from './ResultDialog'
import styles from './GameHost.module.css'

const GameHost = lazy(() => import('./GameHost').then((module) => ({ default: module.GameHost })))

function readResult(state: unknown): MatchResult | null {
  if (typeof state !== 'object' || state === null || !('result' in state)) return null
  const result = state.result as Partial<MatchResult> | null
  if (typeof result?.score !== 'number' || typeof result.effectiveSec !== 'number') return null
  if (result.endReason !== 'timeUp' && result.endReason !== 'defeated') return null
  return result as MatchResult
}

const endFramePattern = /^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/

function readEndFrame(state: unknown): string | null {
  if (typeof state !== 'object' || state === null || !('endFrame' in state)) return null
  return typeof state.endFrame === 'string' && endFramePattern.test(state.endFrame) ? state.endFrame : null
}

export function GameRoute() {
  const location = useLocation()
  const navigationType = useNavigationType()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
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
              <p className={styles.status} role="status">
                Loading the fleet…
              </p>
            </div>
          }
        >
          <GameHost key={matchKey} showingResult={!onPlay} />
        </Suspense>
      ) : (
        <div className={styles.backdrop} style={endFrame ? { backgroundImage: `url(${endFrame})` } : undefined} />
      )}
      {!onPlay && (
        <ResultDialog
          result={readResult(location.state)}
          onPlayAgain={() => void navigate('/play', { replace: true })}
          onMainMenu={() => void navigate('/', { replace: true })}
        />
      )}
    </>
  )
}
